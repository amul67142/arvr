# Demo asset credits

The demo walkthroughs (`unit-3bhk.glb`, `amenities.glb`) mix two kinds of content:

- **Architecture and site layout are generated in code.** This covers walls, slabs, doors,
  windows, glazing, kitchen and bathroom joinery, beds, play equipment, the pool, the
  tennis court, the clubhouse and the trees. It is built by
  `scripts/build-apartment.mjs` and `scripts/build-amenities.mjs`.
- **Furniture, decor and surface textures are downloaded from
  [Poly Haven](https://polyhaven.com).** Every Poly Haven asset is
  [CC0](https://polyhaven.com/license), so it is public domain and needs no attribution.
  They are credited here anyway. `scripts/fetch-polyhaven.mjs` downloads them, and the
  build scripts re-compress them.

`masterplan.glb` and `tower-d-render.png` are generated entirely in code, by
`scripts/make-project-model.mjs` and a PIL script respectively. They use no downloaded
assets.

## Models

| Poly Haven ID | Used in |
| --- | --- |
| sofa_02 | 3BHK living room, clubhouse lounge |
| modern_arm_chair_01 | 3BHK living room |
| mid_century_lounge_chair | 3BHK |
| modern_coffee_table_01 | 3BHK living room, clubhouse lounge |
| side_table_01, side_table_tall_01 | 3BHK bedrooms and living room |
| throw_pillows_01 | 3BHK living room |
| dining_table, dining_chair_02 | 3BHK dining |
| ceiling_fan | 3BHK bedrooms |
| modern_ceiling_lamp_01 | 3BHK living and dining |
| potted_plant_02, potted_plant_04 | 3BHK (both), clubhouse lounge (02) |
| ceramic_vase_02 | 3BHK |
| standing_picture_frame_01, hanging_picture_frame_01, hanging_picture_frame_02 | 3BHK |
| brass_diya_lantern | 3BHK |
| desk_lamp_arm_01 | 3BHK study |
| outdoor_table_chair_set_01 | 3BHK balcony, amenities: poolside |
| planter_box_01 | 3BHK balconies |
| exterior_aircon_unit | 3BHK utility balcony |
| street_lamp_01 | amenities: lamps along paths |
| modular_street_seating, painted_wooden_bench | amenities: seating |
| wooden_picnic_table | amenities: central lawn |
| planter_box_02, shrub_02 | amenities: planting |

## Textures

Floors in the flat: marble_01, herringbone_parquet, oak_wood_planks,
large_grey_tiles, granite_tile, anti_skid_tiles, long_white_tiles and
wood_floor_deck.

Surfaces in the amenities: leafy_grass (normal map only), hexagonal_concrete_paving,
patio_tiles, red_sandstone_tiles, rubber_tiles, rubberized_track,
blue_floor_tiles_01, asphalt_02, concrete_floor_02, wood_floor_deck and marble_01.

Each asset page is at `https://polyhaven.com/a/<id>`.
