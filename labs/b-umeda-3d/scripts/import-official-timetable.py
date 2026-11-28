"""Convert the supplied collection CSVs into Umeda's local timetable dataset."""

import argparse
from collections import Counter
import csv
from datetime import date
import json
from pathlib import Path
import re
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
JR_ROUTES = {
    "2796011001": "kyoto", "2796012001": "kobe", "2796025001": "takarazuka",
    "2796017001": "loop", "2796018001": "loop", "2796073001": "east",
    "2796076001": None, "2796076002": None, "2796076003": None, "2796076004": None,
    "2960021001": "jr-tozai", "2960021002": "jr-tozai",
}
HANKYU_ROUTES = {"ky": "hk-kyoto", "ta": "hk-takarazuka", "ko": "hk-kobe"}
DAYS = {"平日": "weekday", "土曜": "saturday", "日曜": "sunday", "土曜・休日": "weekend"}
# These direction tables both list the same departures at Osaka Station.
OVERLAPS = {frozenset(("2796012001", "2796025001")), frozenset(("2796025001", "2796076001"))}
SOURCE_PRIORITY = {"2796025001": 1, "2796076001": 2}


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def route_for(row):
    url = urlsplit(row["source_url"])
    route = url.path.rsplit("/", 1)[-1]
    if url.scheme == "https" and url.netloc == "timetable.jr-odekake.net" and route in JR_ROUTES:
        station = "jr-kitashinchi" if route.startswith("2960") else "jr-osaka"
        expected_name = "北新地" if station == "jr-kitashinchi" else "大阪"
        if row["station"] == expected_name and row["operator"] == "JR西日本":
            return "jr-west", station, route, JR_ROUTES[route]
    hankyu = re.fullmatch(r"HK-01_(ky|ta|ko)_2_([wh])\.html", route)
    if (url.scheme == "https" and url.netloc == "www.hankyu.co.jp" and hankyu
            and row["station"] == "大阪梅田（阪急）" and row["operator"] == "阪急電鉄"):
        line = HANKYU_ROUTES[hankyu[1]]
        if row["day_type"] == ("平日" if hankyu[2] == "w" else "土曜・休日"):
            return "hankyu", "hankyu-osaka-umeda", line, line
    raise ValueError(f"Unsupported source and station: {row['source_url']} / {row['station']}")


def import_dataset(collection):
    rows = read_csv(collection / "osaka_umeda_verified_timetables.csv")
    split_files = [*collection.glob("jr-west/stations/*.csv"), *collection.glob("hankyu/*.csv")]
    fingerprints = lambda records: Counter(tuple(sorted(row.items())) for row in records)
    if not rows or fingerprints(rows) != fingerprints(row for path in split_files for row in read_csv(path)):
        raise ValueError("Consolidated CSV and operator CSVs disagree")
    manifest = read_csv(collection / "osaka_umeda_collection_manifest.csv")
    if sum(int(entry["train_count"] or 0) for entry in manifest) != len(rows):
        raise ValueError("Manifest train counts do not match the consolidated CSV")

    model = json.loads((ROOT / "data/processed/station.json").read_text(encoding="utf-8"))
    platforms = {}
    for place in model["places"]:
        if place["kind"] != "Platform":
            continue
        for number in re.split(r"[・·]", place.get("boarding", {}).get("label", "")):
            if number.isdecimal():
                platforms[place["stationId"], number] = place

    sources = {}
    partitions = {}
    departures = {}
    for row in rows:
        operator, station, direction, line = route_for(row)
        day = DAYS[row["day_type"]]
        observed_date = row["displayed_date"] or None
        revision = row["revision_date"] or None
        if operator == "jr-west":
            weekday = date.fromisoformat(observed_date).weekday()
            if day != ("saturday" if weekday == 5 else "sunday" if weekday == 6 else "weekday"):
                raise ValueError(f"Source date conflicts with service day: {row['source_url']}")
            if revision and date.fromisoformat(revision) > date.fromisoformat(observed_date):
                raise ValueError(f"Revision is after the timetable date: {row['source_url']}")
        if partitions.setdefault((direction, day), observed_date) != observed_date:
            raise ValueError(f"Multiple dates for the same direction and service day: {row['source_url']}")

        if not re.fullmatch(r"(?:[01]\d|2[0-9]):[0-5]\d", row["departure_time"]):
            raise ValueError(f"Invalid departure time: {row['departure_time']}")
        hour, minute = map(int, row["departure_time"].split(":"))
        time = f"{hour + 24 if hour < 3 else hour:02}:{minute:02}"
        station_id = "sk:station:" + station
        platform_number = row["platform"] or None
        if platform_number and not platform_number.isdecimal():
            raise ValueError(f"Invalid boarding number: {platform_number}")
        place = platforms.get((station_id, platform_number))
        line_id = "sk:line:" + line if line else None
        if line_id and place and line_id not in place.get("serviceLineIds", []):
            raise ValueError(f"Model disagrees with line and platform: {row['source_url']} / {platform_number}")

        url = row["source_url"]
        source_id = f"official:{direction}:{day}:{observed_date or 'published'}"
        source = sources.setdefault(source_id, {
            "id": source_id, "title": row["line"] + " · " + row["direction"],
            "publisher": row["operator"], "url": url, "retrievedAt": None,
            "license": None, "notes": None,
        })
        if source["url"] != url:
            raise ValueError(f"Multiple URLs for {source_id}")
        destination = row["destination"] or None
        service = row["train_type"] or None
        record = {
            "station_id": station_id, "operator_id": "sk:operator:" + operator,
            "line_id": line_id, "platform_id": place["id"] if place else None,
            "platform_number": platform_number, "direction_id": direction,
            "source_date": observed_date, "service_date_type": day,
            "train_number": None, "arrival_time_local": None, "departure_time_local": time,
            "destination_text": destination, "service_class": service,
            "vehicle_series": None, "formation_length": None, "vehicle_assignment_status": "unknown",
            "source_id": source_id, "valid_from": revision, "valid_until": None,
            "remarks": row["remarks"] or None,
        }
        key = (station, day, observed_date, time, platform_number, service, destination)
        if platform_number is None:
            key += (direction,)
        previous = departures.get(key)
        if previous:
            pair = frozenset((direction, previous["direction_id"]))
            if pair not in OVERLAPS:
                raise ValueError(f"Unresolved duplicate departure: {key}")
            if SOURCE_PRIORITY.get(direction, 0) < SOURCE_PRIORITY.get(previous["direction_id"], 0):
                previous, record = record, previous
            record["related_source_ids"] = [previous["source_id"]]
            record["line_id"] = record["line_id"] or previous["line_id"]
        departures[key] = record

    records = sorted(departures.values(), key=lambda row: row["departure_time_local"])
    for index, record in enumerate(records, 1):
        record["trip_id"] = f"official:{index}"
    print(f"{len(rows)} CSV rows, {len(rows) - len(records)} overlapping departures merged, "
          f"{len(records)} departures, {sum(record['platform_id'] is not None for record in records)} linked to model platforms, "
          f"{len(sources)} sources")
    return {"kind": "timetable", "label": "2026-11", "generatedAt": None, "sources": list(sources.values()), "records": records}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection", type=Path, help="Downloaded directory containing data/raw/private-saved")
    collection = parser.parse_args().collection / "data/raw/private-saved"
    result = import_dataset(collection)
    target = ROOT / "data/raw/official-timetable.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    pending = target.with_suffix(".tmp")
    pending.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    pending.replace(target)
