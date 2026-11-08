# World News Map

Click a country on the map to see its newspapers, news sites, news agencies and broadcasters.

## Use it
Double-click `index.html` (needs an internet connection for the map library and country borders).
Links like `index.html#Finland` open straight to a country.

## Refresh the outlet list
```
node scripts/build-data.mjs
```
This regenerates `data/news.js` from [Wikidata](https://www.wikidata.org) (free, CC0) via the
[QLever](https://qlever.dev) query service. Takes a few seconds. Outlets missing from a country
can be added on Wikidata and will appear on the next rebuild.

## Sources (all free)
- Outlets: Wikidata — items that are newspapers, news websites, news agencies, broadcasters or TV stations, with an official website, not dissolved
- Borders: Natural Earth via [world-atlas](https://github.com/topojson/world-atlas)
- Map: [Leaflet](https://leafletjs.com)
