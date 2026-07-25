export function mergePinResult(currentPins = [], pinId = "", updatedPin = {}) {
  return (Array.isArray(currentPins) ? currentPins : []).map((pin) => (
    pin.id === pinId ? { ...updatedPin, error: "" } : pin
  ));
}

export function markPinFailure(currentPins = [], pinId = "", message = "") {
  return (Array.isArray(currentPins) ? currentPins : []).map((pin) => (
    pin.id === pinId ? { ...pin, status: "error", error: String(message || "Pin generation failed.") } : pin
  ));
}
