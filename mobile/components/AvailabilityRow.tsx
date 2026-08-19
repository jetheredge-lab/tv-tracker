import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { Check } from 'lucide-react-native';
import { TitleAvailability } from '../types';
import { PROVIDER_COLORS } from './StreamingBadge';

/**
 * Where a title can be watched.
 *
 * The rule that matters: availability is never used to hide or dim something
 * the viewer could still watch.
 *
 *   owned === null   they have not told us their services -> full colour. An
 *                    unstated preference must not make the app look broken.
 *   owned === true   full colour with a tick - "included with what you pay for"
 *   owned === false  greyed, but ONLY for subscription offers. Still listed,
 *                    still tappable.
 *   rent / buy       neutral chip with the offer named. Never greyed: no
 *                    subscription would ever light these up, so dimming them
 *                    would punish a title for something the viewer cannot fix.
 *   free / ads       neutral chip. Nothing gates these behind a subscription.
 */

const SUBSCRIPTION_OFFERS = ['flatrate'];

const OFFER_LABEL: Record<string, string> = {
  rent: 'Rent',
  buy: 'Buy',
  free: 'Free',
  ads: 'Free with ads',
};

// Subscriptions first - that is what someone deciding what to watch tonight
// can act on without paying again.
const OFFER_ORDER = ['flatrate', 'free', 'ads', 'rent', 'buy'];

interface Props {
  availability?: TitleAvailability[] | null;
  onOpenSettings?: () => void;
}

export const AvailabilityRow: React.FC<Props> = ({ availability, onOpenSettings }) => {
  const rows = availability ?? [];
  if (rows.length === 0) return null;

  const sorted = [...rows].sort(
    (a, b) => OFFER_ORDER.indexOf(a.offerType) - OFFER_ORDER.indexOf(b.offerType)
  );

  const neverAsked = sorted.some((r) => r.owned === null);
  const deepLink = sorted.find((r) => r.deepLink)?.deepLink;

  return (
    <View className="mt-6">
      <Text className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-3">
        Where to watch
      </Text>

      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {sorted.map((row) => {
          const isSubscription = SUBSCRIPTION_OFFERS.includes(row.offerType);
          const dimmed = isSubscription && row.owned === false;
          const theme = PROVIDER_COLORS[row.providerName.toLowerCase().trim()];

          const background = dimmed ? 'transparent' : theme?.bg ?? '#27272a';
          const border = dimmed ? '#3f3f46' : theme?.border ?? '#3f3f46';
          const color = dimmed ? '#71717a' : theme?.text ?? '#e4e4e7';
          const suffix = OFFER_LABEL[row.offerType];

          return (
            <View
              key={`${row.providerName}-${row.offerType}`}
              style={{ backgroundColor: background, borderColor: border }}
              className="flex-row items-center border rounded-lg px-2.5 py-1"
            >
              {row.owned === true ? <Check size={11} color={color} /> : null}
              <Text
                style={{ color }}
                className={`text-[11px] font-semibold ${row.owned === true ? 'ml-1' : ''}`}
              >
                {row.providerName}
                {suffix ? ` · ${suffix}` : ''}
              </Text>
            </View>
          );
        })}
      </View>

      {neverAsked && onOpenSettings ? (
        <TouchableOpacity onPress={onOpenSettings} activeOpacity={0.7} className="mt-3">
          <Text className="text-[11px] text-primary-400 font-semibold">
            Tell us your streaming services to see what is already included →
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Required wherever this data is shown. */}
      <TouchableOpacity
        onPress={() => deepLink && Linking.openURL(deepLink)}
        activeOpacity={deepLink ? 0.7 : 1}
        className="mt-3"
      >
        <Text className="text-[10px] text-zinc-600">
          Streaming availability by JustWatch{deepLink ? ' · view all options' : ''}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default AvailabilityRow;
