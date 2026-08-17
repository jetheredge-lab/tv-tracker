/**
 * NativeWind v4 only wires `className` into core React Native components.
 *
 * v2 used a babel plugin that rewrote className on ANY component, so after the
 * v2 -> v4 upgrade third-party components silently lose their classes: no
 * error, just missing margins on icons and a mispositioned gradient overlay
 * on the show-detail hero. Registering them restores the v2 behaviour.
 *
 * If you start using className on another third-party component, add it here.
 */
import { cssInterop } from 'nativewind';
import { LinearGradient } from 'expo-linear-gradient';
import * as Icons from 'lucide-react-native';

// These components take a `style` prop, so className maps straight onto it.
const classNameToStyle = { className: 'style' } as const;

cssInterop(LinearGradient, classNameToStyle);

// Every lucide icon the app imports. Icons only use layout utilities here
// (margins, opacity), so no colour/size prop remapping is needed.
const LUCIDE_ICONS = [
  'ArrowRight',
  'Bell',
  'Calendar',
  'Check',
  'CheckCircle2',
  'ChevronDown',
  'ChevronLeft',
  'ChevronRight',
  'ChevronUp',
  'Clock',
  'Copy',
  'ExternalLink',
  'Eye',
  'EyeOff',
  'Flame',
  'Globe',
  'Heart',
  'Lock',
  'LogIn',
  'LogOut',
  'Mail',
  'Plus',
  'Search',
  'Server',
  'Settings',
  'ShieldCheck',
  'Sparkles',
  'Star',
  'Trash2',
  'Tv',
  'User',
  'X',
  'XCircle',
] as const;

for (const name of LUCIDE_ICONS) {
  const Component = (Icons as unknown as Record<string, unknown>)[name];
  if (Component) {
    cssInterop(Component as Parameters<typeof cssInterop>[0], classNameToStyle);
  }
}
