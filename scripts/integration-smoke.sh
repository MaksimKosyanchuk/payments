#!/usr/bin/env bash
set -euo pipefail

wait_for() {
	local name="$1"
	local url="$2"
	for attempt in $(seq 1 60); do
		if curl --fail --silent --show-error "$url" >/dev/null; then
			echo "$name is ready"
			return 0
		fi
		sleep 2
	done
	echo "$name did not become ready: $url" >&2
	return 1
}

wait_for ledger http://localhost:3001/metrics
wait_for payments http://localhost:3002/metrics
wait_for notifications http://localhost:3003/health
wait_for frontend http://localhost:3000/login

curl --fail --silent http://localhost:3001/docs >/dev/null
curl --fail --silent http://localhost:3002/docs >/dev/null
curl --fail --silent http://localhost:3003/docs >/dev/null

ledger_metrics=$(curl --fail --silent http://localhost:3001/metrics)
payments_metrics=$(curl --fail --silent http://localhost:3002/metrics)
notifications_metrics=$(curl --fail --silent http://localhost:3003/metrics)

grep -q '^ledger_http_requests_total' <<<"$ledger_metrics"
grep -q '^payments_http_requests_total' <<<"$payments_metrics"
grep -q '^notifications_http_requests_total' <<<"$notifications_metrics"

echo 'integration smoke checks passed'
