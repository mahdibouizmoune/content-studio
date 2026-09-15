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

export function pinAssetIdentity(pin = {}) {
  return String(
    pin.imageQa?.sha256
    || pin.imageQa?.perceptualHash
    || pin.localPath
    || pin.generationConfig?.generatedAt
    || pin.displayUrl
    || pin.imageUrl
    || ''
  );
}

export function mergePreparedPinHosting(currentPins = [], preparedPins = []) {
  const preparedById = new Map((Array.isArray(preparedPins) ? preparedPins : []).map((pin) => [String(pin.id || ''), pin]));
  return (Array.isArray(currentPins) ? currentPins : []).map((current) => {
    const prepared = preparedById.get(String(current.id || ''));
    if (!prepared || pinAssetIdentity(current) !== pinAssetIdentity(prepared)) return current;
    return {
      ...current,
      imgurUrl: prepared.imgurUrl || '',
      hostedImageUrl: prepared.hostedImageUrl || '',
      csvMediaUrl: prepared.csvMediaUrl || '',
      hostingProvider: prepared.hostingProvider || '',
      hostingError: prepared.hostingError || '',
      mediaValidatedAt: prepared.mediaValidatedAt || '',
      imageQa: {
        ...(current.imageQa || {}),
        publicUrlVerified: prepared.imageQa?.publicUrlVerified === true,
        publicDimensionsVerified: prepared.imageQa?.publicDimensionsVerified === true,
        publicIdentityVerified: prepared.imageQa?.publicIdentityVerified === true,
        publicAssetKind: prepared.imageQa?.publicAssetKind || '',
        publicWidth: Number(prepared.imageQa?.publicWidth || 0),
        publicHeight: Number(prepared.imageQa?.publicHeight || 0),
        publicContentType: prepared.imageQa?.publicContentType || '',
        publicUrlCheckedAt: prepared.imageQa?.publicUrlCheckedAt || '',
        publicValidatedUrl: prepared.imageQa?.publicValidatedUrl || '',
        publicSha256: prepared.imageQa?.publicSha256 || '',
        publicPerceptualHash: prepared.imageQa?.publicPerceptualHash || '',
        publicIdentityDistance: Number.isFinite(Number(prepared.imageQa?.publicIdentityDistance))
          ? Number(prepared.imageQa.publicIdentityDistance)
          : null
      }
    };
  });
}
