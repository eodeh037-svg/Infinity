import { Text } from 'react-native';

type Props = {
  children: string;
  className?: string;
};

export default function SectionHeader({ children, className = '' }: Props) {
  return (
    <Text
      className={`text-[12px] font-semibold uppercase tracking-wider text-muted ${className}`}>
      {children}
    </Text>
  );
}