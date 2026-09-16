"""
core/keepalive.py
=================
Client-side keepalive heartbeat component for Streamlit Cloud.
Prevents session timeouts and automatic container sleeps during user inactivity.
"""

from __future__ import annotations
import streamlit.components.v1 as components

def inject_keepalive(interval_seconds: int = 240) -> None:
    """
    Inject a lightweight client-side keepalive script.

    Sends a heartbeat postMessage and background fetch every interval_seconds (default 4 minutes)
    to keep the WebSocket connection active and prevent Streamlit Community Cloud from
    suspending the container due to idle viewer detection.
    """
    interval_ms = interval_seconds * 1000
    js_code = f"""
    <script>
    (function() {{
        if (window.__keepalive_active) return;
        window.__keepalive_active = true;
        setInterval(function() {{
            try {{
                window.parent.postMessage({{type: 'streamlit:keepalive', timestamp: Date.now()}}, '*');
            }} catch (e) {{}}
            try {{
                fetch(window.location.href, {{method: 'HEAD', mode: 'no-cors', cache: 'no-store'}}).catch(function() {{}});
            }} catch (e) {{}}
        }}, {interval_ms});
    }})();
    </script>
    """
    components.html(js_code, height=0, width=0)
