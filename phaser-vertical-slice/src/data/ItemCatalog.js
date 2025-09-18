import Phaser from "../phaser.js";

export const ITEM_CATALOG = Object.freeze({
  skyroot_tonic: {
    id: "skyroot_tonic",
    name: "Skyroot Tonic",
    type: "consumable",
    description: "Restores 40 HP over a short duration.",
    defaultQuantity: 3,
    order: 1,
    iconKey: "ui.item.skyroot_tonic",
    icon: {
      type: "potion",
      colors: {
        glass: 0xd4fff2,
        liquid: 0x65ebb8,
        stopper: 0x2f7d61,
        highlight: 0xf3fffb,
        outline: 0x14302a
      }
    },
    cooldownMs: 8000,
    effect: { type: "heal-over-time", total: 40, durationMs: 2000, ticks: 5 },
    usable: true
  },
  azure_focus: {
    id: "azure_focus",
    name: "Azure Focus",
    type: "consumable",
    description: "Instantly revitalises 30 MP.",
    defaultQuantity: 2,
    order: 2,
    iconKey: "ui.item.azure_focus",
    icon: {
      type: "crystal",
      colors: {
        primary: 0x84d0ff,
        secondary: 0x2c6cff,
        shine: 0xe8f5ff,
        outline: 0x162745
      }
    },
    cooldownMs: 6000,
    effect: { type: "restore-mp", amount: 30 },
    usable: true
  },
  ember_shard: {
    id: "ember_shard",
    name: "Ember Shard",
    type: "material",
    description: "Warm crystalline shard used for crafting combustion cores.",
    defaultQuantity: 5,
    order: 3,
    iconKey: "ui.item.ember_shard",
    icon: {
      type: "shard",
      colors: {
        primary: 0xffa45c,
        secondary: 0xff6f4e,
        core: 0x872218,
        outline: 0x3a0d08
      }
    },
    cooldownMs: 0,
    effect: null,
    usable: false
  },
  wingburst_scroll: {
    id: "wingburst_scroll",
    name: "Wingburst Scroll",
    type: "skill",
    description: "Unlocks a temporary mid-air burst dash when consumed.",
    defaultQuantity: 1,
    order: 4,
    iconKey: "ui.item.wingburst_scroll",
    icon: {
      type: "scroll",
      colors: {
        parchment: 0xf4e1ba,
        trim: 0xc69c56,
        glow: 0x8bd7ff,
        outline: 0x3a2a12
      }
    },
    cooldownMs: 15000,
    effect: { type: "wingburst", durationMs: 12000, charges: 1 },
    usable: true
  }
});

export function getItemDefinition(itemId) {
  if (!itemId) {
    return null;
  }
  return ITEM_CATALOG[itemId] || null;
}

export function createDefaultInventory() {
  return Object.values(ITEM_CATALOG)
    .filter((def) => Number.isFinite(def.defaultQuantity) && def.defaultQuantity > 0)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((def) => ({
      id: def.id,
      name: def.name,
      type: def.type,
      quantity: def.defaultQuantity,
      description: def.description,
      iconKey: def.iconKey,
      cooldownMs: def.cooldownMs ?? 0,
      usable: def.usable !== false
    }));
}

export function createDefaultQuickSlots() {
  return [
    { index: 0, itemId: "skyroot_tonic" },
    { index: 1, itemId: "azure_focus" },
    { index: 2, itemId: null },
    { index: 3, itemId: "wingburst_scroll" }
  ];
}

export function isItemUsable(itemId) {
  const def = getItemDefinition(itemId);
  return def ? def.usable !== false : false;
}

export function ensureItemIconTexture(scene, definition) {
  if (!definition || !definition.iconKey || !scene || !scene.textures) {
    return;
  }
  if (scene.textures.exists(definition.iconKey)) {
    return;
  }

  const size = 64;
  const gfx = scene.make.graphics({ add: false });
  gfx.clear();
  gfx.fillStyle(0x000000, 0);
  gfx.fillRect(0, 0, size, size);

  const { icon } = definition;
  if (!icon) {
    gfx.generateTexture(definition.iconKey, size, size);
    gfx.destroy();
    return;
  }

  const centerX = size * 0.5;
  const centerY = size * 0.5;

  const type = icon.type;
  const colors = icon.colors || {};

  gfx.lineStyle(3, colors.outline ?? 0x1a1e2c, 0.95);

  switch (type) {
    case "potion": {
      const radius = size * 0.22;
      const bodyY = centerY + size * 0.08;
      const neckWidth = size * 0.2;
      const neckHeight = size * 0.16;
      const stopperHeight = size * 0.08;

      gfx.fillStyle(colors.glass ?? 0xe6fff7, 1);
      gfx.fillCircle(centerX, bodyY, radius * 1.15);
      gfx.strokeCircle(centerX, bodyY, radius * 1.15);

      gfx.fillStyle(colors.liquid ?? 0x65ebb8, 0.95);
      gfx.fillCircle(centerX, bodyY, radius);

      gfx.fillStyle(colors.glass ?? 0xe6fff7, 1);
      gfx.fillRoundedRect(centerX - neckWidth * 0.5, bodyY - radius * 1.6, neckWidth, neckHeight, 6);
      gfx.strokeRoundedRect(centerX - neckWidth * 0.5, bodyY - radius * 1.6, neckWidth, neckHeight, 6);

      gfx.fillStyle(colors.stopper ?? 0x2f7d61, 1);
      gfx.fillRoundedRect(centerX - neckWidth * 0.4, bodyY - radius * 1.6 - stopperHeight, neckWidth * 0.8, stopperHeight, 4);

      gfx.lineStyle(2, colors.highlight ?? 0xffffff, 0.7);
      gfx.beginPath();
      gfx.moveTo(centerX - radius * 0.6, bodyY - radius * 0.4);
      gfx.lineTo(centerX - radius * 0.1, bodyY - radius * 0.9);
      gfx.strokePath();
      break;
    }
    case "crystal": {
      const top = { x: centerX, y: centerY - size * 0.32 };
      const left = { x: centerX - size * 0.18, y: centerY + size * 0.08 };
      const right = { x: centerX + size * 0.18, y: centerY + size * 0.08 };
      const bottom = { x: centerX, y: centerY + size * 0.32 };

      gfx.fillStyle(colors.primary ?? 0x82d6ff, 1);
      gfx.fillTriangle(top.x, top.y, left.x, left.y, right.x, right.y);
      gfx.fillTriangle(left.x, left.y, bottom.x, bottom.y, right.x, right.y);

      gfx.lineStyle(3, colors.outline ?? 0x162745, 0.9);
      gfx.strokeTriangle(top.x, top.y, left.x, left.y, right.x, right.y);
      gfx.strokeTriangle(left.x, left.y, bottom.x, bottom.y, right.x, right.y);

      gfx.lineStyle(2, colors.shine ?? 0xffffff, 0.75);
      gfx.beginPath();
      gfx.moveTo(centerX - size * 0.06, centerY);
      gfx.lineTo(centerX, centerY - size * 0.18);
      gfx.lineTo(centerX + size * 0.04, centerY - size * 0.04);
      gfx.strokePath();
      break;
    }
    case "shard": {
      const points = [
        new Phaser.Geom.Point(centerX - size * 0.24, centerY + size * 0.18),
        new Phaser.Geom.Point(centerX - size * 0.08, centerY - size * 0.3),
        new Phaser.Geom.Point(centerX + size * 0.14, centerY - size * 0.2),
        new Phaser.Geom.Point(centerX + size * 0.22, centerY + size * 0.28),
        new Phaser.Geom.Point(centerX - size * 0.02, centerY + size * 0.34)
      ];
      gfx.fillStyle(colors.primary ?? 0xffa45c, 1);
      gfx.fillPoints(points, true);
      gfx.lineStyle(3, colors.outline ?? 0x3a0d08, 0.95);
      gfx.strokePoints(points, true);

      gfx.lineStyle(2, colors.secondary ?? 0xff6f4e, 0.7);
      gfx.beginPath();
      gfx.moveTo(centerX - size * 0.06, centerY - size * 0.12);
      gfx.lineTo(centerX + size * 0.04, centerY + size * 0.16);
      gfx.strokePath();

      gfx.lineStyle(2, colors.core ?? 0x872218, 0.8);
      gfx.beginPath();
      gfx.moveTo(centerX - size * 0.12, centerY + size * 0.12);
      gfx.lineTo(centerX + size * 0.12, centerY);
      gfx.strokePath();
      break;
    }
    case "scroll": {
      const rollRadius = size * 0.12;
      const bodyWidth = size * 0.52;
      const bodyHeight = size * 0.32;

      gfx.fillStyle(colors.parchment ?? 0xf7e5bf, 1);
      gfx.fillRoundedRect(centerX - bodyWidth * 0.5, centerY - bodyHeight * 0.5, bodyWidth, bodyHeight, 10);
      gfx.lineStyle(3, colors.outline ?? 0x3a2a12, 0.9);
      gfx.strokeRoundedRect(centerX - bodyWidth * 0.5, centerY - bodyHeight * 0.5, bodyWidth, bodyHeight, 10);

      gfx.fillStyle(colors.trim ?? 0xc69c56, 0.9);
      gfx.fillRect(centerX - bodyWidth * 0.5, centerY - bodyHeight * 0.15, bodyWidth, bodyHeight * 0.3);

      gfx.fillStyle(colors.outline ?? 0x3a2a12, 0.95);
      gfx.fillCircle(centerX - bodyWidth * 0.5, centerY - bodyHeight * 0.45, rollRadius);
      gfx.fillCircle(centerX + bodyWidth * 0.5, centerY + bodyHeight * 0.45, rollRadius);

      gfx.fillStyle(colors.glow ?? 0x8bd7ff, 0.85);
      gfx.fillCircle(centerX, centerY, size * 0.08);
      gfx.lineStyle(2, colors.glow ?? 0x8bd7ff, 0.7);
      gfx.strokeCircle(centerX, centerY, size * 0.16);
      break;
    }
    default: {
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRoundedRect(centerX - size * 0.25, centerY - size * 0.25, size * 0.5, size * 0.5, 8);
      break;
    }
  }

  gfx.generateTexture(definition.iconKey, size, size);
  gfx.destroy();
}

export function ensureAllItemIcons(scene) {
  Object.values(ITEM_CATALOG).forEach((definition) => {
    ensureItemIconTexture(scene, definition);
  });
}
