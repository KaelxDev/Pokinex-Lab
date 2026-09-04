import { useMemo, useState } from "react";
import EmojiPicker from "./EmojiPicker";
import "./EmojiPickerExtra.css";

const EXTRA_CATEGORIES = [
  {
    id: "people-extra",
    label: "Mais pessoas",
    icon: "🧑",
    emojis: [
      ["🧑", "person pessoa"], ["👨", "man homem"], ["👩", "woman mulher"], ["🧒", "child criança"], ["👦", "boy menino"], ["👧", "girl menina"], ["👶", "baby bebê"], ["🧓", "older person idoso"],
      ["👴", "old man homem idoso"], ["👵", "old woman mulher idosa"], ["🧔", "bearded person barba"], ["👮", "police officer polícia"], ["🕵️", "detective detetive"], ["👷", "construction worker obra"], ["💂", "guard guarda"], ["🥷", "ninja"],
      ["👸", "princess princesa"], ["🤴", "prince príncipe"], ["🧙", "mage wizard mago"], ["🧚", "fairy fada"], ["🧛", "vampire vampiro"], ["🧜", "merperson sereia"], ["🧝", "elf elfo"], ["🧞", "genie gênio"],
      ["🦸", "superhero herói"], ["🦹", "supervillain vilão"], ["🫅", "person crown coroa"], ["💇", "haircut cabelo"], ["💆", "massage massagem"], ["🚶", "walking caminhada"], ["🏃", "running corrida"], ["💃", "dancing dança"],
      ["🕺", "man dancing dança"], ["🧘", "meditation meditação"], ["🧗", "climbing escalada"], ["🏄", "surfing surf"], ["🏊", "swimming natação"], ["🚴", "cycling bicicleta"], ["🤹", "juggling malabarismo"], ["🧖", "sauna"],
    ],
  },
  {
    id: "travel-extra",
    label: "Viagem",
    icon: "✈️",
    emojis: [
      ["🚗", "car carro"], ["🚕", "taxi"], ["🚌", "bus ônibus"], ["🚎", "trolleybus"], ["🏎️", "race car corrida"], ["🚓", "police car polícia"], ["🚑", "ambulance ambulância"], ["🚒", "fire truck bombeiro"],
      ["🚚", "truck caminhão"], ["🚜", "tractor trator"], ["🏍️", "motorcycle moto"], ["🛵", "scooter"], ["🚲", "bicycle bicicleta"], ["🛴", "scooter patinete"], ["✈️", "airplane avião"], ["🛫", "departure partida"],
      ["🛬", "arrival chegada"], ["🚁", "helicopter helicóptero"], ["🚀", "rocket foguete"], ["🛸", "flying saucer ufo"], ["🚢", "ship navio"], ["⛵", "sailboat veleiro"], ["🚤", "speedboat lancha"], ["🚂", "train trem"],
      ["🚆", "train trem"], ["🚇", "metro metrô"], ["🚉", "station estação"], ["🚊", "tram bonde"], ["🚝", "monorail"], ["🚞", "mountain railway"], ["🚋", "tram bonde"], ["🗺️", "map mapa"],
      ["🛣️", "motorway estrada"], ["🛤️", "railway ferrovia"], ["⛽", "fuel posto combustível"], ["🚧", "construction road obra"], ["🗿", "moai estátua"], ["🗽", "statue liberdade"], ["🗼", "tower torre"], ["🏰", "castle castelo"],
    ],
  },
  {
    id: "nature-extra",
    label: "Natureza",
    icon: "🌎",
    emojis: [
      ["🌎", "earth americas terra"], ["🌍", "earth africa terra"], ["🌏", "earth asia terra"], ["🌕", "full moon lua cheia"], ["🌑", "new moon lua nova"], ["🌒", "crescent moon lua"], ["🌓", "first quarter moon"], ["🌔", "waxing moon"],
      ["🌖", "waning moon"], ["🌗", "last quarter moon"], ["🌘", "crescent moon"], ["🌙", "moon lua"], ["⭐", "star estrela"], ["🌟", "glowing star estrela"], ["✨", "sparkles brilho"], ["💫", "dizzy star"],
      ["☄️", "comet cometa"], ["🌌", "milky way galaxy galáxia"], ["🌋", "volcano vulcão"], ["🏔️", "mountain montanha"], ["⛰️", "mountain montanha"], ["🏕️", "camping acampamento"], ["🏜️", "desert deserto"], ["🏝️", "island ilha"],
      ["🏞️", "national park parque"], ["🌊", "ocean mar"], ["🪨", "rock pedra"], ["🪵", "wood madeira"], ["🍄", "mushroom cogumelo"], ["🌰", "chestnut castanha"], ["🪹", "nest ninho"], ["🪺", "nest eggs ninho ovos"],
      ["🌳", "tree árvore"], ["🌲", "evergreen pinheiro"], ["🌴", "palm palm"], ["🌵", "cactus cacto"], ["🌾", "rice planta"], ["🌿", "herb erva"], ["☘️", "shamrock trevo"], ["🍀", "four leaf clover sorte"],
    ],
  },
  {
    id: "tech-extra",
    label: "Tecnologia",
    icon: "💻",
    emojis: [
      ["🖥️", "desktop computador"], ["💻", "laptop notebook"], ["⌨️", "keyboard teclado"], ["🖱️", "mouse"], ["🖨️", "printer impressora"], ["📱", "phone celular"], ["📲", "mobile phone"], ["☎️", "telephone telefone"],
      ["📡", "satellite antenna antena"], ["🔋", "battery bateria"], ["🔌", "plug tomada"], ["💾", "floppy disk disquete"], ["💿", "cd"], ["📀", "dvd"], ["💽", "minidisc"], ["📼", "videocassette"],
      ["📷", "camera câmera"], ["📹", "video camera filmadora"], ["🎥", "movie camera cinema"], ["📺", "television tv"], ["📻", "radio rádio"], ["🎙️", "microphone microfone"], ["🎧", "headphones fone"], ["🔊", "speaker volume"],
      ["🔇", "mute silencioso"], ["📶", "signal wifi sinal"], ["🌐", "internet web"], ["🛰️", "satellite satélite"], ["🔭", "telescope telescópio"], ["🔬", "microscope microscópio"], ["🧪", "science laboratório"], ["⚙️", "settings gear engrenagem"],
      ["🛜", "wireless wifi rede"], ["💡", "light bulb ideia"], ["🔦", "flashlight lanterna"], ["🧰", "toolbox ferramentas"], ["🔧", "wrench chave"], ["🔨", "hammer martelo"], ["🪛", "screwdriver chave"], ["🔩", "bolt parafuso"],
    ],
  },
  {
    id: "symbols-extra",
    label: "Símbolos",
    icon: "🔣",
    emojis: [
      ["❤️", "red heart coração"], ["🩷", "pink heart rosa"], ["🧡", "orange heart laranja"], ["💛", "yellow heart amarelo"], ["💚", "green heart verde"], ["🩵", "light blue heart azul claro"], ["💙", "blue heart azul"], ["💜", "purple heart roxo"],
      ["🤎", "brown heart marrom"], ["🖤", "black heart preto"], ["🩶", "grey heart cinza"], ["🤍", "white heart branco"], ["💔", "broken heart partido"], ["❤️‍🔥", "heart fire fogo"], ["❤️‍🩹", "healing heart cura"], ["💗", "growing heart crescendo"],
      ["💖", "sparkling heart brilho"], ["💘", "heart arrow flecha"], ["💝", "heart ribbon laço"], ["💕", "two hearts dois corações"], ["💞", "revolving hearts"], ["💓", "beating heart batendo"], ["💟", "heart decoration"], ["❣️", "heart exclamation"],
      ["☮️", "peace paz"], ["☯️", "yin yang"], ["☢️", "radioactive radioativo"], ["☣️", "biohazard risco biológico"], ["⚠️", "warning aviso"], ["🚫", "prohibited proibido"], ["🔞", "no minors"], ["♻️", "recycle reciclagem"],
      ["✅", "check confirmado"], ["❌", "cross errado"], ["❗", "exclamation exclamação"], ["❓", "question pergunta"], ["‼️", "double exclamation"], ["⁉️", "question exclamation"], ["⭕", "circle círculo"], ["🔴", "red circle"],
    ],
  },
  {
    id: "food-extra",
    label: "Comidas",
    icon: "🍕",
    emojis: [
      ["🍎", "apple maçã"], ["🍐", "pear pera"], ["🍊", "orange laranja"], ["🍋", "lemon limão"], ["🍌", "banana"], ["🍉", "watermelon melancia"], ["🍇", "grapes uva"], ["🍓", "strawberry morango"],
      ["🫐", "blueberries mirtilo"], ["🍒", "cherries cereja"], ["🍑", "peach pêssego"], ["🥭", "mango manga"], ["🍍", "pineapple abacaxi"], ["🥥", "coconut coco"], ["🥝", "kiwi"], ["🍅", "tomato tomate"],
      ["🥕", "carrot cenoura"], ["🌽", "corn milho"], ["🥔", "potato batata"], ["🍞", "bread pão"], ["🥐", "croissant"], ["🥨", "pretzel"], ["🧀", "cheese queijo"], ["🍔", "burger hambúrguer"],
      ["🍕", "pizza"], ["🌭", "hot dog cachorro quente"], ["🌮", "taco"], ["🌯", "burrito"], ["🍣", "sushi"], ["🍜", "ramen"], ["🍰", "cake bolo"], ["🍩", "donut"],
      ["🍪", "cookie biscoito"], ["🍫", "chocolate"], ["🍿", "popcorn pipoca"], ["🍦", "ice cream sorvete"], ["🍧", "shaved ice"], ["🍭", "lollipop pirulito"], ["☕", "coffee café"], ["🧋", "bubble tea chá"],
    ],
  },
  {
    id: "animals-extra",
    label: "Animais",
    icon: "🐾",
    emojis: [
      ["🐶", "dog cachorro"], ["🐱", "cat gato"], ["🐭", "mouse rato"], ["🐹", "hamster"], ["🐰", "rabbit coelho"], ["🦊", "fox raposa"], ["🐻", "bear urso"], ["🐼", "panda"],
      ["🐨", "koala"], ["🐯", "tiger tigre"], ["🦁", "lion leão"], ["🐮", "cow vaca"], ["🐷", "pig porco"], ["🐸", "frog sapo"], ["🐵", "monkey macaco"], ["🙈", "see no evil"],
      ["🐔", "chicken galinha"], ["🐧", "penguin pinguim"], ["🐦", "bird pássaro"], ["🦆", "duck pato"], ["🦅", "eagle águia"], ["🦉", "owl coruja"], ["🐺", "wolf lobo"], ["🐗", "boar javali"],
      ["🐴", "horse cavalo"], ["🦄", "unicorn unicórnio"], ["🐝", "bee abelha"], ["🦋", "butterfly borboleta"], ["🐌", "snail caracol"], ["🐞", "ladybug joaninha"], ["🐢", "turtle tartaruga"], ["🐍", "snake cobra"],
      ["🦎", "lizard lagarto"], ["🦂", "scorpion escorpião"], ["🦀", "crab caranguejo"], ["🐙", "octopus polvo"], ["🦑", "squid lula"], ["🐠", "fish peixe"], ["🐬", "dolphin golfinho"], ["🐳", "whale baleia"],
    ],
  },
  {
    id: "games-extra",
    label: "Jogos",
    icon: "🎮",
    emojis: [
      ["🎮", "game controller controle"], ["🕹️", "joystick"], ["🎯", "target alvo"], ["🎲", "dice dado"], ["♟️", "chess pawn xadrez"], ["♟", "chess"], ["🃏", "joker coringa"], ["🀄", "mahjong"],
      ["🎰", "slot machine"], ["🎳", "bowling boliche"], ["⚽", "soccer futebol"], ["🏀", "basketball basquete"], ["🏈", "american football"], ["⚾", "baseball"], ["🎾", "tennis tênis"], ["🏐", "volleyball vôlei"],
      ["🏆", "trophy troféu"], ["🥇", "gold medal medalha"], ["🥈", "silver medal prata"], ["🥉", "bronze medal bronze"], ["🏅", "medal medalha"], ["🎖️", "military medal"], ["🏹", "bow arco"], ["⚔️", "crossed swords espadas"],
      ["🛡️", "shield escudo"], ["🪄", "magic wand magia"], ["🔮", "crystal ball cristal"], ["🧩", "puzzle quebra cabeça"], ["🎸", "guitar guitarra"], ["🥁", "drum bateria"], ["🎹", "piano"], ["🎤", "microphone microfone"],
    ],
  },
];

export default function EmojiPickerExtra({ onSelect }) {
  const [extraOpen, setExtraOpen] = useState(false);
  const [activeExtra, setActiveExtra] = useState(EXTRA_CATEGORIES[0].id);
  const active = EXTRA_CATEGORIES.find((category) => category.id === activeExtra) || EXTRA_CATEGORIES[0];

  const extraEmojis = useMemo(() => active.emojis, [active]);

  return (
    <div className="emoji-picker-extra-shell">
      <EmojiPicker onSelect={onSelect} />
      <button
        type="button"
        className={`emoji-more-toggle${extraOpen ? " active" : ""}`}
        onClick={() => setExtraOpen((current) => !current)}
        aria-expanded={extraOpen}
      >
        <span>✨</span>
        <span>{extraOpen ? "Menos emojis" : "Mais emojis"}</span>
        <span className="emoji-more-chevron">{extraOpen ? "⌃" : "⌄"}</span>
      </button>
      {extraOpen && (
        <div className="emoji-extra-panel">
          <div className="emoji-extra-tabs">
            {EXTRA_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={activeExtra === category.id ? "active" : ""}
                onClick={() => setActiveExtra(category.id)}
                title={category.label}
                aria-label={category.label}
              >
                {category.icon}
              </button>
            ))}
          </div>
          <div className="emoji-extra-title">{active.label}</div>
          <div className="emoji-extra-grid">
            {extraEmojis.map(([emoji, keywords], index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                className="emoji-extra-cell"
                onClick={() => onSelect(emoji)}
                title={keywords}
                aria-label={keywords}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
