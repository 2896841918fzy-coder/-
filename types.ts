
export enum AppMode {
  TREE = 'TREE',
  SCATTER = 'SCATTER',
  PHOTO_ZOOM = 'PHOTO_ZOOM'
}

export interface HandGesture {
  isFist: boolean;
  isOpen: boolean;
  isPinching: boolean;
  position: { x: number; y: number }; // Normalized -1 to 1
}

export interface PhotoData {
  id: string;
  url: string;
}

// LUXURY PALETTE
export const COLORS = {
  MATTE_GREEN: '#0b3d20',   // Deep Emerald / British Racing Green
  METALLIC_GOLD: '#F8D686', // Champagne Gold (Less yellow, more elegant)
  CHRISTMAS_RED: '#680c18', // Royal Burgundy / Wine Red
  SNOW_WHITE: '#ffffff',
  DIAMOND: '#e0f7fa',       // Icy white for sparkles
  RIBBON_GOLD: '#c5a059'    // Darker antique gold for details
};
