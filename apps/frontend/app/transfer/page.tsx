'use client';

import { Suspense } from 'react';
import TransferPageInner from './TransferPageInner';

export default function TransferPage() {
	return (
		<Suspense fallback={<main style={{ padding: 24 }}>Завантаження…</main>}>
			<TransferPageInner />
		</Suspense>
	);
}
