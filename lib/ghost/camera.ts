export type CameraFailure = "denied" | "unsupported" | "failed";

export type CameraStatus = "starting" | "live" | CameraFailure;

export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1440 },
  },
};

const DENIED = new Set(["NotAllowedError", "PermissionDeniedError", "SecurityError"]);
const UNSUPPORTED = new Set([
  "NotFoundError",
  "DevicesNotFoundError",
  "OverconstrainedError",
  "ConstraintNotSatisfiedError",
  "NotSupportedError",
]);

export function cameraUnsupportedError(): Error {
  const error = new Error("Camera capture is not supported in this browser");
  error.name = "NotSupportedError";
  return error;
}

export function classifyCameraError(error: unknown): CameraFailure {
  const name =
    typeof error === "object" && error !== null && "name" in error ? String(error.name) : "";
  if (DENIED.has(name)) return "denied";
  if (UNSUPPORTED.has(name)) return "unsupported";
  return "failed";
}

export function isCameraFailure(status: CameraStatus): status is CameraFailure {
  return status === "denied" || status === "unsupported" || status === "failed";
}
