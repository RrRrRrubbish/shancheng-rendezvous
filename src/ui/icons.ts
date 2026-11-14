import {
  Mountain, ArrowRight, Volume2, VolumeX, BookOpen, Settings, MapPin, Leaf,
  Pause, X, Check, TramFront, CableCar, Layers, ArrowLeft, Plus, Minus,
  ArrowUpDown, Fullscreen, Minimize, ArrowUpRight, Sparkles,
} from 'lucide';

// One 24 × 24 SVG family for every UI pictogram; see THIRD_PARTY_NOTICES.
const icons = {
  mountain: Mountain, arrow: ArrowRight, sound: Volume2, mute: VolumeX,
  book: BookOpen, settings: Settings, pin: MapPin, leaf: Leaf, pause: Pause,
  close: X, check: Check, rail: TramFront, cable: CableCar, layers: Layers,
  back: ArrowLeft, plus: Plus, minus: Minus, lift: ArrowUpDown,
  escalator: ArrowUpRight, fullscreen: Fullscreen, minimize: Minimize, spark: Sparkles,
};
export type IconName = keyof typeof icons;
export function icon(name: string): string {
  const shapes = (icons[name as IconName] ?? icons.pin).map(([tag, attrs]) =>
    '<'+tag+' '+Object.entries(attrs).map(([key,value])=>key+'="'+value+'"').join(' ')+'/>').join('');
  return '<svg class="icon" data-icon="'+name+'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+shapes+'</svg>';
}
