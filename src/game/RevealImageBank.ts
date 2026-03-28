export interface RevealImageEntry {
  word: string;      // Russian word to guess
  category: string;  // Russian category label
  imageUrl: string;  // Stable Wikimedia Commons thumbnail URL
}

const W = 'https://upload.wikimedia.org/wikipedia/commons/thumb/';
const WEN = 'https://upload.wikimedia.org/wikipedia/en/thumb/';

export const REVEAL_IMAGE_BANK: RevealImageEntry[] = [
  // ─── Животные ─────────────────────────────────────────────
  {
    word: 'кот', category: 'Животные',
    imageUrl: W + '4/4d/Cat_November_2010-1a.jpg/640px-Cat_November_2010-1a.jpg',
  },
  {
    word: 'собака', category: 'Животные',
    imageUrl: W + '2/26/YellowLabradorLooking_new.jpg/640px-YellowLabradorLooking_new.jpg',
  },
  {
    word: 'лошадь', category: 'Животные',
    imageUrl: W + 'd/de/Nokota_Horses_cropped.jpg/640px-Nokota_Horses_cropped.jpg',
  },
  {
    word: 'слон', category: 'Животные',
    imageUrl: W + '3/37/African_Bush_Elephant.jpg/640px-African_Bush_Elephant.jpg',
  },
  {
    word: 'жираф', category: 'Животные',
    imageUrl: W + '9/9e/Giraffe_Mikumi_National_Park.jpg/640px-Giraffe_Mikumi_National_Park.jpg',
  },
  {
    word: 'лев', category: 'Животные',
    imageUrl: W + '7/73/Lion_waiting_in_Namibia.jpg/640px-Lion_waiting_in_Namibia.jpg',
  },
  {
    word: 'тигр', category: 'Животные',
    imageUrl: W + '1/1c/Tigerwater_edit2.jpg/640px-Tigerwater_edit2.jpg',
  },
  {
    word: 'медведь', category: 'Животные',
    imageUrl: W + '9/9e/Ours_brun_parcanimalierpyrenees_1.jpg/640px-Ours_brun_parcanimalierpyrenees_1.jpg',
  },
  {
    word: 'пингвин', category: 'Животные',
    imageUrl: W + '1/11/Penguin_in_Antarctica_jumping_out_of_the_water.jpg/640px-Penguin_in_Antarctica_jumping_out_of_the_water.jpg',
  },
  {
    word: 'сова', category: 'Животные',
    imageUrl: W + '9/97/The_snowy_owl.jpg/640px-The_snowy_owl.jpg',
  },
  {
    word: 'орёл', category: 'Животные',
    imageUrl: W + '4/4e/American-bald-eagle.jpg/640px-American-bald-eagle.jpg',
  },
  {
    word: 'акула', category: 'Животные',
    imageUrl: W + '5/56/White_shark.jpg/640px-White_shark.jpg',
  },
  {
    word: 'дельфин', category: 'Животные',
    imageUrl: W + '1/10/Tursiops_truncatus_01.jpg/640px-Tursiops_truncatus_01.jpg',
  },
  {
    word: 'кролик', category: 'Животные',
    imageUrl: W + '1/1f/Oryctolagus_cuniculus_Rcdo.jpg/640px-Oryctolagus_cuniculus_Rcdo.jpg',
  },
  {
    word: 'утка', category: 'Животные',
    imageUrl: W + 'b/bf/Bucephala-albeola-010.jpg/640px-Bucephala-albeola-010.jpg',
  },
  {
    word: 'зебра', category: 'Животные',
    imageUrl: W + 'e/e3/Plains_Zebra_Equus_quagga.jpg/640px-Plains_Zebra_Equus_quagga.jpg',
  },
  {
    word: 'фламинго', category: 'Животные',
    imageUrl: W + 'a/a6/Flamingos_Laguna_Colorada.jpg/640px-Flamingos_Laguna_Colorada.jpg',
  },
  {
    word: 'крокодил', category: 'Животные',
    imageUrl: W + '1/15/Salt_water_crocodile_thermal_cooling.jpg/640px-Salt_water_crocodile_thermal_cooling.jpg',
  },
  {
    word: 'волк', category: 'Животные',
    imageUrl: W + '5/5f/Kolm%C3%A5rden_Wolf.jpg/640px-Kolm%C3%A5rden_Wolf.jpg',
  },
  {
    word: 'лиса', category: 'Животные',
    imageUrl: W + '3/30/Vulpes_vulpes_ssp_fulvus.jpg/640px-Vulpes_vulpes_ssp_fulvus.jpg',
  },
  {
    word: 'черепаха', category: 'Животные',
    imageUrl: W + 'f/f3/Galapagos_giant_tortoise_Geochelone_elephantopus_ssp.jpg/640px-Galapagos_giant_tortoise_Geochelone_elephantopus_ssp.jpg',
  },
  {
    word: 'попугай', category: 'Животные',
    imageUrl: W + '4/4d/Macaw_on_red.jpg/640px-Macaw_on_red.jpg',
  },
  {
    word: 'хомяк', category: 'Животные',
    imageUrl: W + 'c/c0/Hamster_dam.jpg/640px-Hamster_dam.jpg',
  },

  // ─── Еда ──────────────────────────────────────────────────
  {
    word: 'яблоко', category: 'Еда',
    imageUrl: W + '1/15/Red_Apple.jpg/640px-Red_Apple.jpg',
  },
  {
    word: 'банан', category: 'Еда',
    imageUrl: W + '4/44/Bananas_white_background_DS.jpg/640px-Bananas_white_background_DS.jpg',
  },
  {
    word: 'арбуз', category: 'Еда',
    imageUrl: W + '4/47/PNG_transparency_demonstration_1.png/640px-PNG_transparency_demonstration_1.png',
  },
  {
    word: 'клубника', category: 'Еда',
    imageUrl: W + '2/29/PerfectStrawberry.jpg/640px-PerfectStrawberry.jpg',
  },
  {
    word: 'апельсин', category: 'Еда',
    imageUrl: W + 'c/c4/Orange-Fruit-Pieces.jpg/640px-Orange-Fruit-Pieces.jpg',
  },
  {
    word: 'пицца', category: 'Еда',
    imageUrl: W + 'a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg/640px-Eq_it-na_pizza-margherita_sep2005_sml.jpg',
  },
  {
    word: 'гамбургер', category: 'Еда',
    imageUrl: W + '4/4f/Hamburger_sandwich.jpg/640px-Hamburger_sandwich.jpg',
  },
  {
    word: 'торт', category: 'Еда',
    imageUrl: W + '4/40/Chocolate_Cake_Flourless_%281%29.jpg/640px-Chocolate_Cake_Flourless_%281%29.jpg',
  },
  {
    word: 'мороженое', category: 'Еда',
    imageUrl: W + 'b/bd/Sundae_with_maraschino_cherry.jpg/640px-Sundae_with_maraschino_cherry.jpg',
  },
  {
    word: 'хлеб', category: 'Еда',
    imageUrl: W + '3/33/Fresh_made_bread_05.jpg/640px-Fresh_made_bread_05.jpg',
  },
  {
    word: 'ананас', category: 'Еда',
    imageUrl: W + 'c/cc/Pineapple_and_cross_section.jpg/640px-Pineapple_and_cross_section.jpg',
  },
  {
    word: 'виноград', category: 'Еда',
    imageUrl: W + '1/1e/Trauben.jpg/640px-Trauben.jpg',
  },
  {
    word: 'тыква', category: 'Еда',
    imageUrl: W + '2/2a/Jackolantern_2003-10-31.jpg/640px-Jackolantern_2003-10-31.jpg',
  },
  {
    word: 'лимон', category: 'Еда',
    imageUrl: W + 'b/b0/Lemon-Whole-Split.jpg/640px-Lemon-Whole-Split.jpg',
  },
  {
    word: 'суши', category: 'Еда',
    imageUrl: W + '6/60/Sushi_platter.jpg/640px-Sushi_platter.jpg',
  },

  // ─── Транспорт ────────────────────────────────────────────
  {
    word: 'велосипед', category: 'Транспорт',
    imageUrl: W + '4/41/Bicycle_with_racks_and_panniers.jpg/640px-Bicycle_with_racks_and_panniers.jpg',
  },
  {
    word: 'самолёт', category: 'Транспорт',
    imageUrl: W + '4/4e/Cessna_172S_Skyhawk_SP.jpg/640px-Cessna_172S_Skyhawk_SP.jpg',
  },
  {
    word: 'корабль', category: 'Транспорт',
    imageUrl: W + '7/7c/Cruise_ship_Regal_Princess_in_Alaska.jpg/640px-Cruise_ship_Regal_Princess_in_Alaska.jpg',
  },
  {
    word: 'поезд', category: 'Транспорт',
    imageUrl: W + 'c/c7/TGV_Lyria_10.jpg/640px-TGV_Lyria_10.jpg',
  },
  {
    word: 'вертолёт', category: 'Транспорт',
    imageUrl: W + '6/66/Bell_206_Lima.jpg/640px-Bell_206_Lima.jpg',
  },
  {
    word: 'мотоцикл', category: 'Транспорт',
    imageUrl: W + 'e/e8/BMW_Motorrad_R1200_R.jpg/640px-BMW_Motorrad_R1200_R.jpg',
  },
  {
    word: 'ракета', category: 'Транспорт',
    imageUrl: W + '5/5b/Space_Shuttle_Columbia_launching.jpg/640px-Space_Shuttle_Columbia_launching.jpg',
  },
  {
    word: 'трактор', category: 'Транспорт',
    imageUrl: W + '9/9a/John_Deere_6310.jpg/640px-John_Deere_6310.jpg',
  },
  {
    word: 'автобус', category: 'Транспорт',
    imageUrl: W + 'f/f5/London_Bus_route_148.jpg/640px-London_Bus_route_148.jpg',
  },
  {
    word: 'подводная лодка', category: 'Транспорт',
    imageUrl: W + 'b/bb/USS_Alaska_%28SSBN-732%29.jpg/640px-USS_Alaska_%28SSBN-732%29.jpg',
  },

  // ─── Природа ──────────────────────────────────────────────
  {
    word: 'гора', category: 'Природа',
    imageUrl: W + '1/1e/Al_Bahah_-_Saudi_Arabia3.jpg/640px-Al_Bahah_-_Saudi_Arabia3.jpg',
  },
  {
    word: 'водопад', category: 'Природа',
    imageUrl: W + '3/3b/Niagara_Falls_%2C_from_the_American_Falls_observation_area%2C_May_2017.jpg/640px-Niagara_Falls_%2C_from_the_American_Falls_observation_area%2C_May_2017.jpg',
  },
  {
    word: 'вулкан', category: 'Природа',
    imageUrl: W + 'e/e8/Mauna_Kea_from_Mauna_Loa_Observatory%2C_Nov_2014.jpg/640px-Mauna_Kea_from_Mauna_Loa_Observatory%2C_Nov_2014.jpg',
  },
  {
    word: 'радуга', category: 'Природа',
    imageUrl: W + 'f/f5/Rainbow_above_Kaviskis_Lake%2C_Lithuania.jpg/640px-Rainbow_above_Kaviskis_Lake%2C_Lithuania.jpg',
  },
  {
    word: 'закат', category: 'Природа',
    imageUrl: W + '9/9a/2021_Solstice_Sunset_at_Stonehenge_%2851298735766%29.jpg/640px-2021_Solstice_Sunset_at_Stonehenge_%2851298735766%29.jpg',
  },
  {
    word: 'пляж', category: 'Природа',
    imageUrl: W + '8/80/Maldives_beach.jpg/640px-Maldives_beach.jpg',
  },
  {
    word: 'снег', category: 'Природа',
    imageUrl: W + '0/00/Obertraun_-_view_from_Krippenstein_02.jpg/640px-Obertraun_-_view_from_Krippenstein_02.jpg',
  },
  {
    word: 'молния', category: 'Природа',
    imageUrl: W + 'b/b4/Lightning_over_Oradea_Romania_2.jpg/640px-Lightning_over_Oradea_Romania_2.jpg',
  },
  {
    word: 'пустыня', category: 'Природа',
    imageUrl: W + 'f/f6/Sahara_Desert_Algeria.jpg/640px-Sahara_Desert_Algeria.jpg',
  },

  // ─── Предметы ─────────────────────────────────────────────
  {
    word: 'зонт', category: 'Предметы',
    imageUrl: W + '6/69/Umbrella_blue_sky.jpg/640px-Umbrella_blue_sky.jpg',
  },
  {
    word: 'шляпа', category: 'Предметы',
    imageUrl: W + '7/70/Cowboy_hat_new.jpg/640px-Cowboy_hat_new.jpg',
  },
  {
    word: 'очки', category: 'Предметы',
    imageUrl: W + '3/3d/Glasses_800_edit.png/640px-Glasses_800_edit.png',
  },
  {
    word: 'гитара', category: 'Предметы',
    imageUrl: W + '4/45/GuitareClassique5.png/640px-GuitareClassique5.png',
  },
  {
    word: 'пианино', category: 'Предметы',
    imageUrl: W + '5/5b/Steinway_Konzertfl%C3%BCgel_D-274.jpg/640px-Steinway_Konzertfl%C3%BCgel_D-274.jpg',
  },
  {
    word: 'корона', category: 'Предметы',
    imageUrl: W + 'b/b4/Imperial_State_Crown_of_the_United_Kingdom_%282%29.jpg/640px-Imperial_State_Crown_of_the_United_Kingdom_%282%29.jpg',
  },
  {
    word: 'якорь', category: 'Предметы',
    imageUrl: W + '3/35/Navy_anchor_illustration.jpg/640px-Navy_anchor_illustration.jpg',
  },
  {
    word: 'компас', category: 'Предметы',
    imageUrl: W + '4/4c/Compass_rose_browns_00.jpg/640px-Compass_rose_browns_00.jpg',
  },
  {
    word: 'телескоп', category: 'Предметы',
    imageUrl: W + '7/76/Treptow_Refraktor.jpg/640px-Treptow_Refraktor.jpg',
  },
  {
    word: 'лампочка', category: 'Предметы',
    imageUrl: W + 'a/a9/Gluehlampe_01_KMJ.png/640px-Gluehlampe_01_KMJ.png',
  },
  {
    word: 'ключ', category: 'Предметы',
    imageUrl: W + '6/69/GoldenKey.jpg/640px-GoldenKey.jpg',
  },
  {
    word: 'часы', category: 'Предметы',
    imageUrl: W + '5/52/OldClock.jpg/640px-OldClock.jpg',
  },
  {
    word: 'книга', category: 'Предметы',
    imageUrl: W + '8/8e/Book_cover_-_The_Lord_of_the_Rings_%282006%29.jpg/640px-Book_cover_-_The_Lord_of_the_Rings_%282006%29.jpg',
  },

  // ─── Постройки ────────────────────────────────────────────
  {
    word: 'маяк', category: 'Постройки',
    imageUrl: W + '1/16/Cape-Hatteras-Lighthouse.jpg/640px-Cape-Hatteras-Lighthouse.jpg',
  },
  {
    word: 'замок', category: 'Постройки',
    imageUrl: W + 'f/f3/Schloss_Neuschwanstein_2013.jpg/640px-Schloss_Neuschwanstein_2013.jpg',
  },
  {
    word: 'пирамида', category: 'Постройки',
    imageUrl: W + 'a/af/All_Gizah_Pyramids.jpg/640px-All_Gizah_Pyramids.jpg',
  },
  {
    word: 'мост', category: 'Постройки',
    imageUrl: W + '0/0c/GoldenGateBridge-001.jpg/640px-GoldenGateBridge-001.jpg',
  },
  {
    word: 'Эйфелева башня', category: 'Постройки',
    imageUrl: W + 'a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/640px-Tour_Eiffel_Wikimedia_Commons.jpg',
  },
  {
    word: 'церковь', category: 'Постройки',
    imageUrl: W + 'e/ee/Basil%27s_Cathedral_%28Wikimedia_Commons%29.jpg/640px-Basil%27s_Cathedral_%28Wikimedia_Commons%29.jpg',
  },
];

/** Pick a random image entry, avoiding recent repeats */
export function getRandomRevealImage(usedIndices: number[] = []): RevealImageEntry & { index: number } {
  const available = REVEAL_IMAGE_BANK
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !usedIndices.includes(index));

  const pool = available.length > 0 ? available : REVEAL_IMAGE_BANK.map((entry, index) => ({ entry, index }));
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { ...picked.entry, index: picked.index };
}
