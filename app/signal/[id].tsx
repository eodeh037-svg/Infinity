import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../../component/ui/EmptyState';

export default function SignalDetail() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-6">
        <EmptyState
          icon="analytics-outline"
          title="No signal selected"
          message="Open a signal from the Signals screen to view its full breakdown."
        />
      </View>
    </SafeAreaView>
  );
}