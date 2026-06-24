"""
HealthHub API smoke test.
Runs against a live backend on localhost:5000.
Usage:  python smoke_test.py
"""
import json, sys, urllib.request, urllib.error

BASE = "http://localhost:5000"
PASS = 0; FAIL = 0


def req(method, path, data=None, token=None, base=BASE):
    url = base + path
    body = json.dumps(data).encode() if data is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=8)
        return json.loads(resp.read()), resp.status
    except urllib.error.HTTPError as e:
        return json.loads(e.read()), e.code
    except Exception as ex:
        return {"error": str(ex)}, 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✓  {label}")
    else:
        FAIL += 1
        print(f"  ✗  {label}  {detail}")


print("\n═══════════════════════════════════════════")
print("  HealthHub API Smoke Test")
print("═══════════════════════════════════════════\n")

# ── Health check ──────────────────────────────────────────
body, code = req("GET", "/api/v2/health")
check("v2 health check", code == 200 and body.get("status") == "ok")

body, code = req("GET", "/api/health")
check("v1 health check", code == 200)

# ── Auth ──────────────────────────────────────────────────
body, code = req("POST", "/api/auth/login", {"username": "nopole", "password": "Test1234!"})
token = body.get("token") or body.get("access_token")
check("login", code == 200 and token, f"code={code}")

# Bad login
body2, code2 = req("POST", "/api/auth/login", {"username": "nopole", "password": "wrong"})
check("bad login rejected", code2 == 401)

# ── Public endpoints ──────────────────────────────────────
body, code = req("GET", "/api/hospitals")
check("GET /api/hospitals", code == 200 and "hospitals" in body)

body, code = req("GET", "/api/pharmacies")
check("GET /api/pharmacies", code == 200 and "pharmacies" in body)

body, code = req("GET", "/api/services")
check("GET /api/services", code == 200 and "services" in body)

body, code = req("GET", "/api/v2/alerts")
check("GET /api/v2/alerts (public)", code == 200 and "alerts" in body)

body, code = req("GET", "/api/v2/search?q=hospit")
check("Global search", code == 200 and len(body.get("hospitals", [])) > 0)

# ── Authenticated v2 ─────────────────────────────────────
if token:
    body, code = req("GET", "/api/v2/me/profile", token=token)
    check("GET /api/v2/me/profile", code == 200 and "user" in body)

    # Save profile
    body, code = req("PUT", "/api/v2/me/profile",
                     {"blood_type": "O+", "height_cm": 175, "allergies": "penicillin"}, token=token)
    check("PUT /api/v2/me/profile", code == 200)

    body, code = req("GET", "/api/v2/me/vitals", token=token)
    check("GET /api/v2/me/vitals", code == 200 and "vitals" in body)

    body, code = req("POST", "/api/v2/me/vitals", {"heart_rate": 72, "notes": "smoke test"}, token=token)
    check("POST /api/v2/me/vitals", code == 201, str(body))
    vital_id = body.get("id")

    if vital_id:
        body, code = req("DELETE", f"/api/v2/me/vitals/{vital_id}", token=token)
        check("DELETE /api/v2/me/vitals/<id>", code == 200)

    body, code = req("GET", "/api/v2/prescriptions/me", token=token)
    check("GET /api/v2/prescriptions/me", code == 200)

    body, code = req("GET", "/api/v2/notifications", token=token)
    check("GET /api/v2/notifications", code == 200 and "unread" in body)

    body, code = req("POST", "/api/v2/notifications/read-all", token=token)
    check("POST /api/v2/notifications/read-all", code == 200)

    body, code = req("GET", "/api/v2/uploads", token=token)
    check("GET /api/v2/uploads", code == 200 and "files" in body)

    body, code = req("GET", "/api/v2/me/export", token=token)
    check("GET /api/v2/me/export", code == 200 and "users" in body)

    body, code = req("POST", "/api/v2/sos", {"latitude": 3.848, "longitude": 11.502}, token=token)
    check("POST /api/v2/sos", code == 200, str(body))

    body, code = req("POST", "/api/diagnosis",
                     {"symptoms": "chest pain shortness of breath", "age": 55, "severity": 8}, token=token)
    check("POST /api/diagnosis", code == 200 and "differential" in body, str(body)[:80])

    body, code = req("GET", "/api/diagnosis/history", token=token)
    check("GET /api/diagnosis/history", code == 200)

# ── Summary ───────────────────────────────────────────────
total = PASS + FAIL
print(f"\n{'─'*44}")
print(f"  Results: {PASS}/{total} passed  |  {FAIL} failed")
print(f"{'─'*44}\n")
sys.exit(0 if FAIL == 0 else 1)
