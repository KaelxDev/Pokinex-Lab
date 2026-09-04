import { useMemo, useState } from "react";
import "./EmojiPicker.css";

const CATEGORIES = [
  {
    id: "people",
    label: "Pessoas",
    icon: "☻",
    emojis: [
      ["😀", "grinning smile feliz"], ["😃", "smile alegre"], ["😄", "smiling feliz"], ["😁", "beaming"], ["😆", "laughing rindo"], ["😅", "sweat smile"], ["😂", "joy laughing"], ["🤣", "rofl"],
      ["🥲", "smiling tear"], ["😊", "blush fofo"], ["😇", "innocent"], ["🙂", "slightly smile"], ["🙃", "upside down"], ["😉", "wink piscando"], ["😌", "relieved"], ["😍", "heart eyes amor"],
      ["🥰", "love hearts"], ["😘", "kiss beijo"], ["😗", "kissing"], ["😚", "kissing closed eyes"], ["😙", "kissing smiling"], ["🥹", "tears chorando"], ["😋", "yum gostoso"], ["😛", "tongue lingua"],
      ["😝", "stuck out tongue"], ["😜", "wink tongue"], ["🤪", "zany louco"], ["🤨", "raised eyebrow"], ["🧐", "monocle"], ["🤓", "nerd"], ["😎", "sunglasses cool"], ["🤩", "star eyes"],
      ["🥳", "party festa"], ["😏", "smirk"], ["😒", "unamused"], ["😞", "disappointed"], ["😔", "pensive"], ["😟", "worried"], ["😕", "confused"], ["🙁", "slightly frown"],
      ["☹️", "frown"], ["😣", "persevere"], ["😖", "confounded"], ["😫", "tired"], ["😩", "weary"], ["🥺", "pleading"], ["😢", "cry"], ["😭", "sob"],
      ["😤", "triumph"], ["😠", "angry bravo"], ["😡", "rage raiva"], ["🤬", "cursing"], ["🤯", "exploding head"], ["😳", "flushed"], ["🥵", "hot"], ["🥶", "cold"],
      ["😱", "scream medo"], ["😨", "fearful"], ["😰", "anxious"], ["😥", "sad relief"], ["😓", "sweat"], ["🤗", "hug abraço"], ["🤔", "thinking pensando"], ["🫡", "salute saudacao"],
      ["🤭", "hand over mouth"], ["🫢", "shy"], ["🫣", "peek"], ["🤫", "shushing"], ["🤥", "lying mentira"], ["😶", "no mouth"], ["🫠", "melting"], ["😐", "neutral"],
      ["😑", "expressionless"], ["😬", "grimace"], ["🙄", "rolling eyes"], ["😯", "hushed"], ["😦", "frowning open mouth"], ["😧", "anguish"], ["😮", "open mouth"], ["😲", "astonished"],
      ["🥱", "yawn bocejo"], ["😴", "sleeping sono"], ["🤤", "drooling"], ["😪", "sleepy"], ["😵", "dizzy"], ["🤐", "zipper mouth"], ["🤢", "nauseated"], ["🤮", "vomit"],
      ["🤧", "sneezing"], ["😷", "mask"], ["🤒", "sick"], ["🤕", "injured"], ["🤠", "cowboy"], ["😈", "smiling devil"], ["👿", "angry devil"], ["👹", "ogre"],
      ["👺", "goblin"], ["🤡", "clown"], ["💩", "poop"], ["👻", "ghost"], ["💀", "skull"], ["☠️", "skull crossbones"], ["👽", "alien"], ["🤖", "robot"],
      ["😺", "grinning cat"], ["😸", "grinning cat smile"], ["😹", "cat joy"], ["😻", "cat heart eyes"], ["😼", "cat smirk"], ["😽", "cat kiss"], ["🙀", "cat scream"], ["😿", "cat cry"],
      ["😾", "cat angry"], ["🫨", "shaking face"], ["🫤", "dotted face"], ["🫥", "dotted face"], ["🤑", "money mouth"], ["🤦", "facepalm"], ["🤷", "shrug"], ["🙅", "no gesture"],
      ["🙆", "ok gesture"], ["💁", "information desk"], ["🙋", "raising hand"], ["🙇", "bow"], ["🤦‍♂️", "man facepalm"], ["🫶", "heart hands"],
    ],
  },
  {
    id: "gestures",
    label: "Gestos",
    icon: "✋",
    emojis: [
      ["👍", "thumbs up gostei"], ["👎", "thumbs down"], ["👌", "ok"], ["✌️", "peace paz"], ["🤞", "fingers crossed"], ["🤟", "love"], ["🤘", "rock"], ["🤙", "call"],
      ["👋", "wave ola tchau"], ["👏", "clap aplauso"], ["🙌", "raised hands"], ["👐", "open hands"], ["🤝", "handshake"], ["🙏", "pray"], ["💪", "muscle força"], ["🫶", "heart hands"],
      ["☝️", "point up"], ["👇", "point down"], ["👆", "point up"], ["👉", "point right"], ["👈", "point left"], ["✍️", "writing"], ["💅", "nail polish"], ["🤳", "selfie"],
      ["🤏", "pinch"], ["🤌", "pinched fingers"], ["🖖", "vulcan"], ["👊", "fist punch"], ["✊", "raised fist"], ["🤛", "left fist"], ["🤜", "right fist"], ["🤚", "raised back hand"],
      ["🖐️", "five fingers"], ["🫰", "finger heart"], ["🫵", "point at viewer"], ["🫳", "palm down"], ["🫴", "palm up"], ["🫱", "right hand"], ["🫲", "left hand"], ["🫸", "rightwards hand"],
      ["🫷", "leftwards hand"], ["🤲", "palms up"], ["🦾", "mechanical arm"], ["🦿", "mechanical leg"], ["👀", "eyes"], ["👁️", "eye"], ["👄", "mouth"], ["👅", "tongue"],
      ["👂", "ear"], ["👃", "nose"], ["🧠", "brain"], ["🫀", "anatomical heart"], ["🫁", "lungs"], ["🦷", "tooth"], ["👋🏻", "wave light skin"], ["👍🏻", "thumbs up light skin"],
    ],
  },
  {
    id: "animals",
    label: "Animais",
    icon: "🐾",
    emojis: [
      ["🐶", "dog cachorro"], ["🐱", "cat gato"], ["🐭", "mouse"], ["🐹", "hamster"], ["🐰", "rabbit coelho"], ["🦊", "fox"], ["🐻", "bear urso"], ["🐼", "panda"],
      ["🐨", "koala"], ["🐯", "tiger"], ["🦁", "lion"], ["🐮", "cow"], ["🐷", "pig"], ["🐸", "frog sapo"], ["🐵", "monkey"], ["🙈", "see no evil"],
      ["🙉", "hear no evil"], ["🙊", "speak no evil"], ["🐔", "chicken"], ["🐧", "penguin"], ["🐦", "bird"], ["🐤", "chick"], ["🦄", "unicorn"], ["🐝", "bee"],
      ["🦋", "butterfly"], ["🐌", "snail"], ["🐞", "ladybug"], ["🐢", "turtle"], ["🐍", "snake"], ["🦎", "lizard"], ["🐙", "octopus"], ["🦑", "squid"],
      ["🐠", "fish"], ["🐟", "fish"], ["🐡", "blowfish"], ["🦈", "shark"], ["🐳", "whale"], ["🐋", "whale"], ["🦀", "crab"], ["🦞", "lobster"],
      ["🐴", "horse"], ["🦓", "zebra"], ["🦒", "giraffe"], ["🐘", "elephant"], ["🦏", "rhinoceros"], ["🦛", "hippo"], ["🐪", "camel"], ["🐫", "two hump camel"],
      ["🦘", "kangaroo"], ["🦬", "bison"], ["🦌", "deer"], ["🐐", "goat"], ["🐑", "sheep"], ["🐏", "ram"], ["🐕", "dog"], ["🐩", "poodle"],
      ["🐈", "cat"], ["🐓", "rooster"], ["🦃", "turkey"], ["🦆", "duck"], ["🦢", "swan"], ["🦉", "owl"], ["🦅", "eagle"], ["🦜", "parrot"],
      ["🦚", "peacock"], ["🦩", "flamingo"], ["🐊", "crocodile"], ["🐅", "tiger"], ["🐆", "leopard"], ["🦍", "gorilla"], ["🦧", "orangutan"], ["🐒", "monkey"],
      ["🦇", "bat"], ["🐺", "wolf"], ["🦝", "raccoon"], ["🦨", "skunk"], ["🦡", "badger"], ["🦦", "otter"], ["🦥", "sloth"], ["🦫", "beaver"],
      ["🦂", "scorpion"], ["🕷️", "spider"], ["🕸️", "spider web"], ["🐜", "ant"], ["🐛", "bug"], ["🪲", "beetle"], ["🪳", "cockroach"], ["🦗", "cricket"],
      ["🐬", "dolphin"], ["🦭", "seal"], ["🐉", "dragon"], ["🐲", "dragon face"], ["🦕", "dinosaur"], ["🦖", "t rex dinosaur"], ["🪼", "jellyfish"], ["🦪", "oyster"],
      ["🪸", "coral"], ["🦐", "shrimp"], ["🐚", "shell"], ["🦤", "dodo"], ["🦣", "mammoth"], ["🦧", "orangutan"], ["🦫", "beaver"], ["🦨", "skunk"],
    ],
  },
  {
    id: "nature",
    label: "Natureza",
    icon: "🌿",
    emojis: [
      ["🌱", "seedling planta"], ["🌿", "herb"], ["☘️", "shamrock trevo"], ["🍀", "four leaf clover sorte"], ["🎋", "bamboo"], ["🌵", "cactus"], ["🌴", "palm tree"], ["🌳", "tree"],
      ["🌲", "evergreen tree"], ["🌳", "deciduous tree"], ["🌴", "palm"], ["🌱", "sprout"], ["🌷", "tulip"], ["🌹", "rose"], ["🌺", "hibiscus"], ["🌸", "cherry blossom"],
      ["🌼", "blossom"], ["🌻", "sunflower"], ["💐", "bouquet"], ["🍁", "maple leaf"], ["🍂", "fallen leaf"], ["🍃", "leaves wind"], ["🌾", "rice plant"], ["🪴", "potted plant"],
      ["☀️", "sun"], ["🌤️", "sun behind cloud"], ["⛅", "partly cloudy"], ["🌥️", "mostly cloudy"], ["☁️", "cloud"], ["🌦️", "sun rain"], ["🌧️", "rain"], ["⛈️", "thunderstorm"],
      ["🌩️", "lightning cloud"], ["🌨️", "snow cloud"], ["❄️", "snowflake"], ["☃️", "snowman"], ["🌪️", "tornado"], ["🌫️", "fog"], ["🌈", "rainbow"], ["💧", "droplet agua"],
      ["🌊", "wave mar"], ["🔥", "fire fogo"], ["💨", "wind"], ["🌍", "earth"], ["🌎", "earth americas"], ["🌏", "earth asia"], ["🌙", "crescent moon"], ["🌕", "full moon"],
      ["🌑", "new moon"], ["🌒", "waxing crescent"], ["🌓", "first quarter moon"], ["🌔", "waxing gibbous"], ["🌗", "last quarter moon"], ["🌘", "waning crescent"], ["⭐", "star"], ["🌟", "glowing star"],
      ["✨", "sparkles"], ["💫", "dizzy star"], ["☄️", "comet"], ["🌌", "milky way space"], ["🌠", "shooting star"], ["🪐", "saturn planet"], ["🌋", "volcano"], ["🏔️", "mountain snow"],
      ["⛰️", "mountain"], ["🏕️", "camping"], ["🏜️", "desert"], ["🏝️", "island"], ["🏞️", "national park"], ["🌅", "sunrise"], ["🌄", "mountain sunrise"], ["🌇", "sunset city"],
    ],
  },
  {
    id: "food",
    label: "Comida",
    icon: "🍔",
    emojis: [
      ["🍎", "apple"], ["🍐", "pear"], ["🍊", "orange"], ["🍋", "lemon"], ["🍌", "banana"], ["🍉", "watermelon"], ["🍇", "grapes"], ["🍓", "strawberry"],
      ["🫐", "blueberry"], ["🍒", "cherries"], ["🍑", "peach"], ["🍍", "pineapple"], ["🥝", "kiwi"], ["🍅", "tomato"], ["🥑", "avocado"], ["🌽", "corn"],
      ["🥥", "coconut"], ["🥭", "mango"], ["🍈", "melon"], ["🍏", "green apple"], ["🥕", "carrot"], ["🥔", "potato"], ["🍆", "eggplant"], ["🥒", "cucumber"],
      ["🥬", "leafy greens"], ["🥦", "broccoli"], ["🧄", "garlic"], ["🧅", "onion"], ["🍄", "mushroom"], ["🌶️", "hot pepper"], ["🫑", "bell pepper"], ["🫒", "olive"],
      ["🍕", "pizza"], ["🍔", "burger"], ["🍟", "fries"], ["🌭", "hot dog"], ["🌮", "taco"], ["🌯", "burrito"], ["🥪", "sandwich"], ["🥗", "salad"],
      ["🍿", "popcorn"], ["🍣", "sushi"], ["🍜", "ramen"], ["🍝", "spaghetti"], ["🍚", "rice"], ["🍙", "rice ball"], ["🥟", "dumpling"], ["🍱", "bento"],
      ["🥐", "croissant"], ["🥖", "baguette"], ["🥨", "pretzel"], ["🧀", "cheese"], ["🥚", "egg"], ["🍳", "fried egg"], ["🥓", "bacon"], ["🥩", "steak"],
      ["🍗", "chicken leg"], ["🍖", "meat bone"], ["🍦", "ice cream"], ["🍨", "ice cream bowl"], ["🍧", "shaved ice"], ["🍮", "custard"], ["🧁", "cupcake"], ["🥧", "pie"],
      ["🍩", "donut"], ["🍪", "cookie"], ["🎂", "cake"], ["🍰", "shortcake"], ["🍫", "chocolate"], ["🍬", "candy"], ["🍭", "lollipop"], ["🍯", "honey"],
      ["☕", "coffee"], ["🧋", "bubble tea"], ["🥤", "drink"], ["🍵", "tea"], ["🧃", "juice"], ["🥛", "milk"], ["🍼", "baby bottle"], ["🥂", "clinking glasses"],
    ],
  },
  {
    id: "activities",
    label: "Atividades",
    icon: "⚽",
    emojis: [
      ["⚽", "soccer futebol"], ["🏀", "basketball basquete"], ["🏈", "football"], ["⚾", "baseball"], ["🥎", "softball"], ["🎾", "tennis"], ["🏐", "volleyball"], ["🏉", "rugby"],
      ["🥏", "frisbee"], ["🎱", "pool billiards"], ["🪀", "yo yo"], ["🏓", "ping pong"], ["🏸", "badminton"], ["🏒", "ice hockey"], ["🏑", "field hockey"], ["🥍", "lacrosse"],
      ["🏏", "cricket sport"], ["⛳", "golf"], ["🏹", "archery"], ["🥊", "boxing"], ["🥋", "martial arts"], ["🛹", "skateboard"], ["🛼", "roller skate"], ["⛸️", "ice skate"],
      ["🎿", "ski"], ["🏂", "snowboard"], ["🏄", "surfing"], ["🏊", "swimming"], ["🚴", "cycling"], ["🏋️", "weightlifting"], ["🤸", "gymnastics"], ["🧗", "climbing"],
      ["🎮", "game videogame"], ["🕹️", "joystick"], ["🎯", "target"], ["🎲", "dice"], ["♟️", "chess"], ["🧩", "puzzle"], ["🃏", "joker card"], ["🎳", "bowling"],
      ["🎸", "guitar"], ["🎹", "piano"], ["🎤", "microphone"], ["🎧", "headphones"], ["🎷", "saxophone"], ["🎺", "trumpet"], ["🎻", "violin"], ["🥁", "drum"],
      ["🎨", "art painting"], ["🎭", "theater"], ["🎪", "circus"], ["🎬", "movie"], ["🎟️", "ticket"], ["🎼", "music score"], ["🎶", "music notes"], ["🎵", "music note"],
      ["🏆", "trophy"], ["🥇", "gold medal"], ["🥈", "silver medal"], ["🥉", "bronze medal"], ["🏅", "medal"], ["🎉", "party festa"], ["🎊", "confetti"], ["🎁", "gift"],
      ["🎈", "balloon"], ["🎆", "fireworks"], ["🎇", "sparkler"], ["🪅", "pinata"], ["🚀", "rocket"], ["🛸", "ufo"], ["🪂", "parachute"], ["🎢", "roller coaster"],
    ],
  },
  {
    id: "travel",
    label: "Viagem",
    icon: "✈️",
    emojis: [
      ["🚗", "car carro"], ["🚕", "taxi"], ["🚙", "suv"], ["🚌", "bus onibus"], ["🚎", "trolleybus"], ["🏎️", "race car"], ["🚓", "police car"], ["🚑", "ambulance"],
      ["🚒", "fire engine"], ["🚐", "minibus"], ["🛻", "pickup truck"], ["🚚", "truck"], ["🚛", "articulated truck"], ["🚜", "tractor"], ["🛵", "scooter"], ["🏍️", "motorcycle"],
      ["🚲", "bicycle bike"], ["🛴", "kick scooter"], ["✈️", "airplane"], ["🛫", "airplane departure"], ["🛬", "airplane arrival"], ["🛩️", "small airplane"], ["🚁", "helicopter"], ["🚀", "rocket"],
      ["🚂", "locomotive train"], ["🚆", "train"], ["🚇", "metro"], ["🚊", "tram"], ["🚝", "monorail"], ["🚄", "high speed train"], ["🚅", "bullet train"], ["🚉", "station"],
      ["🚢", "ship navio"], ["⛴️", "ferry"], ["🛥️", "motor boat"], ["⛵", "sailboat"], ["🚤", "speedboat"], ["🛟", "life ring"], ["⚓", "anchor"], ["🗺️", "world map"],
      ["🧭", "compass"], ["🏖️", "beach"], ["🏝️", "island"], ["🏜️", "desert"], ["🏔️", "mountain"], ["🗻", "mount fuji"], ["🏕️", "camping"], ["🏨", "hotel"],
      ["🏠", "house"], ["🏰", "castle"], ["🗼", "tokyo tower"], ["🗽", "statue liberty"], ["🗿", "moai"], ["⛩️", "shrine"], ["🕌", "mosque"], ["⛪", "church"],
      ["🎡", "ferris wheel"], ["🎢", "roller coaster"], ["🎠", "carousel"], ["🌉", "bridge night"], ["🌁", "bridge fog"], ["🌃", "night city"], ["🌆", "city sunset"], ["🌇", "sunset city"],
    ],
  },
  {
    id: "objects",
    label: "Objetos",
    icon: "💡",
    emojis: [
      ["💡", "idea light"], ["📱", "phone celular"], ["💻", "computer computador"], ["⌨️", "keyboard"], ["🖱️", "mouse"], ["🖥️", "desktop"], ["🖨️", "printer"], ["📷", "camera"],
      ["📺", "tv"], ["📻", "radio"], ["🎥", "video camera"], ["📹", "camcorder"], ["🎙️", "microphone"], ["📡", "antenna"], ["🔋", "battery"], ["🔌", "plug"],
      ["💾", "floppy disk"], ["💿", "cd"], ["📀", "dvd"], ["📟", "pager"], ["📞", "telephone"], ["☎️", "phone"], ["📠", "fax"], ["🧮", "abacus"],
      ["📚", "books"], ["📖", "book"], ["📝", "memo"], ["✏️", "pencil"], ["🖊️", "pen"], ["🖋️", "fountain pen"], ["📎", "paperclip"], ["📌", "pushpin"],
      ["📍", "location pin"], ["📁", "folder"], ["📂", "open folder"], ["🗂️", "folders"], ["🗃️", "card file"], ["🗄️", "file cabinet"], ["🗑️", "trash"], ["📦", "package"],
      ["🔒", "lock cadeado"], ["🔓", "unlock"], ["🔑", "key chave"], ["🗝️", "old key"], ["🔐", "locked key"], ["🔍", "magnifying glass"], ["🔎", "search"], ["🔔", "bell"],
      ["⚙️", "gear settings"], ["🔧", "wrench"], ["🧰", "toolbox"], ["🪛", "screwdriver"], ["🔨", "hammer"], ["🪚", "saw"], ["🔩", "nut bolt"], ["🧲", "magnet"],
      ["🔬", "microscope"], ["🔭", "telescope"], ["🧪", "test tube"], ["🧬", "dna"], ["⚗️", "alembic"], ["💎", "gem"], ["💰", "money"], ["💳", "card"],
      ["🎒", "backpack"], ["👜", "handbag"], ["💼", "briefcase"], ["👓", "glasses"], ["🕶️", "sunglasses"], ["🎩", "top hat"], ["👑", "crown"], ["💍", "ring"],
      ["🛋️", "couch"], ["🪑", "chair"], ["🛏️", "bed"], ["🚪", "door"], ["🚿", "shower"], ["🛁", "bathtub"], ["🪞", "mirror"], ["🧴", "bottle"],
    ],
  },
  {
    id: "symbols",
    label: "Símbolos",
    icon: "❤️",
    emojis: [
      ["❤️", "red heart"], ["🧡", "orange heart"], ["💛", "yellow heart"], ["💚", "green heart"], ["💙", "blue heart"], ["💜", "purple heart"], ["🖤", "black heart"], ["🤍", "white heart"],
      ["🤎", "brown heart"], ["🩷", "pink heart"], ["🩵", "light blue heart"], ["🩶", "grey heart"], ["💔", "broken heart"], ["❤️‍🔥", "heart fire"], ["❤️‍🩹", "healing heart"], ["💕", "two hearts"],
      ["💞", "revolving hearts"], ["💓", "beating heart"], ["💗", "growing heart"], ["💖", "sparkling heart"], ["💘", "heart arrow"], ["💝", "heart ribbon"], ["💟", "heart decoration"], ["❣️", "heart exclamation"],
      ["🔥", "fire"], ["✨", "sparkles"], ["⭐", "star"], ["🌟", "glowing star"], ["💫", "dizzy"], ["💥", "boom"], ["💯", "hundred"], ["💢", "anger symbol"],
      ["❗", "exclamation"], ["❓", "question"], ["‼️", "double exclamation"], ["⁉️", "question exclamation"], ["✅", "check"], ["❌", "cross"], ["⚠️", "warning"], ["🚫", "prohibited"],
      ["⭕", "circle"], ["❎", "cross mark"], ["✔️", "check mark"], ["☑️", "check box"], ["➕", "plus"], ["➖", "minus"], ["✖️", "multiply"], ["➗", "divide"],
      ["♾️", "infinity"], ["💲", "dollar"], ["🔴", "red circle"], ["🟠", "orange circle"], ["🟡", "yellow circle"], ["🟢", "green circle"], ["🔵", "blue circle"], ["🟣", "purple circle"],
      ["⚫", "black circle"], ["⚪", "white circle"], ["🟤", "brown circle"], ["🔺", "red triangle"], ["🔻", "down triangle"], ["🔶", "orange diamond"], ["🔷", "blue diamond"], ["🔸", "small orange diamond"],
      ["🔹", "small blue diamond"], ["▪️", "black square"], ["▫️", "white square"], ["◾", "black medium square"], ["◽", "white medium square"], ["©️", "copyright"], ["®️", "registered"], ["™️", "trademark"],
      ["#️⃣", "hash"], ["*️⃣", "asterisk"], ["0️⃣", "zero"], ["1️⃣", "one"], ["2️⃣", "two"], ["3️⃣", "three"], ["4️⃣", "four"], ["5️⃣", "five"],
      ["6️⃣", "six"], ["7️⃣", "seven"], ["8️⃣", "eight"], ["9️⃣", "nine"], ["🔟", "ten"], ["🔤", "letters"], ["🔠", "uppercase"], ["🔡", "lowercase"],
    ],
  },
];

const RECENT = ["😀", "😂", "😍", "🥹", "😎", "😭", "😡", "👍", "❤️", "🔥", "🎉", "🚀"];

export default function EmojiPicker({ onSelect }) {
  const [activeCategory, setActiveCategory] = useState("people");
  const [query, setQuery] = useState("");

  const active = CATEGORIES.find((category) => category.id === activeCategory) || CATEGORIES[0];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return active.emojis;
    return CATEGORIES.flatMap((category) => category.emojis).filter(([, keywords]) => keywords.includes(normalized));
  }, [active, query]);

  function selectEmoji(emoji) {
    onSelect(emoji);
  }

  return (
    <div className="emoji-picker" role="dialog" aria-label="Seletor de emojis" onClick={(event) => event.stopPropagation()}>
      <div className="emoji-picker-tabs">
        <button type="button" className="emoji-tab muted" disabled>GIFs</button>
        <button type="button" className="emoji-tab muted" disabled>Figurinha</button>
        <button type="button" className="emoji-tab active">Emoji</button>
        <span className="emoji-picker-feature">👋</span>
      </div>

      <div className="emoji-search">
        <span aria-hidden="true">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder=":smile:"
          aria-label="Pesquisar emoji"
        />
      </div>

      <div className="emoji-picker-body">
        <nav className="emoji-category-rail" aria-label="Categorias de emoji">
          <button
            type="button"
            className={!query ? "category-button recent" : "category-button"}
            onClick={() => { setQuery(""); setActiveCategory("people"); }}
            aria-label="Recentes"
          >
            ◷
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              className={!query && activeCategory === category.id ? "category-button selected" : "category-button"}
              onClick={() => { setQuery(""); setActiveCategory(category.id); }}
              aria-label={category.label}
              title={category.label}
            >
              {category.icon}
            </button>
          ))}
        </nav>

        <div className="emoji-grid-wrap">
          <div className="emoji-category-title">{query ? "Resultados" : active.label}</div>
          <div className="emoji-grid">
            {filtered.map(([emoji, keywords], index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                className="emoji-cell"
                onClick={() => selectEmoji(emoji)}
                aria-label={keywords}
                title={keywords}
              >
                {emoji}
              </button>
            ))}
            {!filtered.length && <div className="emoji-empty">Nenhum emoji encontrado.</div>}
          </div>
        </div>
      </div>

      <div className="emoji-picker-footer">
        <span className="emoji-preview">{filtered[0]?.[0] || RECENT[0] || "🙂"}</span>
        <span>Selecione um emoji</span>
      </div>
    </div>
  );
}
