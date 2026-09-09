import { AppHeader } from './components/AppHeader';
import { LiveTransfersProvider } from './components/LiveTransfersProvider';
import { NotificationToasts } from './components/NotificationToasts';

export const metadata = {
	title: 'P2P Ledger — starter',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="uk">
			<body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
				<LiveTransfersProvider>
					<AppHeader />
					{children}
					<NotificationToasts />
				</LiveTransfersProvider>
			</body>
		</html>
	);
}
