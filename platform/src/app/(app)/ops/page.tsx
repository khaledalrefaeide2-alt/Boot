import type { Metadata } from 'next';
import { OpsRoomClient } from './ops-client';

export const metadata: Metadata = { title: 'غرفة العمليات' };

export default function OpsRoomPage() {
  return <OpsRoomClient />;
}
