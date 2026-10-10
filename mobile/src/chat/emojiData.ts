/** Emojis offered in the picker, by category. A curated set rather than all of Unicode, so the list stays quick to scroll. */
export interface EmojiCategory {
  key: string;
  label: string;
  /** Shown on the category tab. */
  icon: string;
  emojis: string[];
}

const split = (text: string) => text.split(' ').filter(Boolean);

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: split(
      '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖',
    ),
  },
  {
    key: 'gestures',
    label: 'People',
    icon: '👍',
    emojis: split(
      '👍 👎 👌 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐 🖖 👋 🤝 🙏 👏 🙌 👐 🤲 💪 🦾 ✍️ 💅 🤳 👀 👁 🧠 🫶 🫡 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧑‍💻 👨‍🎓 👩‍🎓 👨‍🏫 👩‍🏫 👨‍👩‍👧 👫 🧑‍🤝‍🧑 👶 🧒 🧑 🧓',
    ),
  },
  {
    key: 'hearts',
    label: 'Hearts',
    icon: '❤️',
    emojis: split('❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 💌 💋 💯 💢 💥 💫 💦 💨 💤 ✨ ⭐ 🌟 🔥 🎉 🎊 🎈 🎁 🏆 🥇 🥈 🥉 🏅 🎖'),
  },
  {
    key: 'nature',
    label: 'Nature',
    icon: '🐶',
    emojis: split(
      '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🦆 🦅 🦉 🐺 🐴 🦄 🐝 🦋 🐌 🐞 🐢 🐍 🐙 🐬 🐳 🦈 🐘 🦒 🐕 🐈 🌵 🎄 🌲 🌳 🌴 🌱 🍀 🍁 🍂 🌷 🌹 🌺 🌸 🌼 🌻 🌞 🌝 🌚 🌍 🌙 ☀️ ⛅ ☁️ 🌧 ⛈ ❄️ ☃️ 🌈 🌊',
    ),
  },
  {
    key: 'food',
    label: 'Food',
    icon: '🍕',
    emojis: split('🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥕 🌽 🌶 🥔 🍞 🥐 🧀 🥚 🍳 🥞 🥓 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍣 🍱 🍤 🍙 🍚 🍦 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 ☕ 🍵 🥤 🍺 🍻 🥂 🍷'),
  },
  {
    key: 'activity',
    label: 'Activity',
    icon: '⚽',
    emojis: split('⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🏓 🏸 🥊 🥋 ⛳ 🎣 🎿 ⛷ 🏂 🏋️ 🤸 🏄 🏊 🚴 🧗 🎮 🕹 🎲 ♟ 🎯 🎳 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🎻 📚 📖 ✏️ 📝 💻 📱 ⌚ 📷 🎥'),
  },
  {
    key: 'travel',
    label: 'Travel',
    icon: '🚗',
    emojis: split('🚗 🚕 🚌 🚎 🏎 🚓 🚑 🚒 🚚 🚜 🏍 🚲 🛴 ✈️ 🛫 🛬 🚀 🛸 🚁 ⛵ 🚤 🚢 🚂 🚇 🚉 🗺 🧭 🏔 ⛰ 🌋 🏕 🏖 🏝 🏠 🏡 🏢 🏫 🏥 🏦 🏰 🗼 🗽 🕌 ⛪ 🌉 🌃 🌆 🌅 🇹🇷 🇺🇸 🇬🇧 🇩🇪 🇫🇷 🇮🇹 🇪🇸 🇯🇵 🇰🇷 🇧🇷 🇨🇦 🇦🇿'),
  },
  {
    key: 'objects',
    label: 'Objects',
    icon: '💡',
    emojis: split('💡 🔦 🔋 🔌 💾 🖥 ⌨️ 🖱 🖨 📡 🔑 🗝 🔒 🔓 🔐 🛡 🔗 ⛓ 🧲 ⚙️ 🔧 🔨 🧰 💰 💵 💶 💳 🪙 💎 📈 📉 📊 🧾 ✉️ 📦 📌 📍 📎 ✂️ 🗑 ⏰ ⏳ 🔔 🔕 📣 💬 💭 ❓ ❗ ✅ ❌ ⚠️ 🚫 ♻️ 🆗 🆕 🔝 ➕ ➖'),
  },
];
