#!/usr/bin/env bash
set -e
npm --prefix server run dev & SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM
npm --prefix client run dev -- --host 0.0.0.0
