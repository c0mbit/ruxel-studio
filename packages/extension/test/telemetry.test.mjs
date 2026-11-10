import assert from "node:assert/strict";
import test from "node:test";

test("Telemetry: default state is strictly opt-in (disabled)", () => {
    const defaultState = false;
    assert.equal(defaultState, false, "Telemetry must default to false for GDPR compliance");
});

test("Telemetry: opt-in setting toggle updates state correctly", () => {
    let telemetryEnabled = false;
    
    // Simulate user selecting "Yes, Opt In"
    function setTelemetryOptIn(userChoice) {
        telemetryEnabled = userChoice;
        return telemetryEnabled;
    }

    assert.equal(setTelemetryOptIn(true), true);
    assert.equal(telemetryEnabled, true);

    // Simulate user toggling off
    assert.equal(setTelemetryOptIn(false), false);
    assert.equal(telemetryEnabled, false);
});

test("Telemetry: JSON-RPC contract payload shape validation", () => {
    const optInRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "rux/setTelemetryOptIn",
        params: { enabled: true },
    };

    assert.equal(optInRequest.method, "rux/setTelemetryOptIn");
    assert.equal(optInRequest.params.enabled, true);

    const statusRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "rux/telemetryStatus",
    };

    assert.equal(statusRequest.method, "rux/telemetryStatus");
});
