cd "$(dirname "$0")" || exit 1

PORT=8000

echo "Serving:  $(pwd)"
echo "Open in browser:  http://localhost:$PORT/"
echo "Debug overlay:    http://localhost:$PORT/index.html?debug"
echo "Stop the server:  press Control-C"
echo

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  exec python -m SimpleHTTPServer "$PORT"
elif command -v ruby >/dev/null 2>&1; then
  exec ruby -run -e httpd . -p "$PORT"
else
  echo "Could not find python3, python, or ruby on this Mac."
  read -n 1 -r -p "Press any key to close..."
  exit 1
fi
