import { describe, expect, it } from "vitest";
import {
  CAMERA_CONSTRAINTS,
  cameraUnsupportedError,
  classifyCameraError,
  isCameraFailure,
} from "@/lib/ghost/camera";

function named(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe("camera", () => {
  it("asks for the rear camera without audio", () => {
    expect(CAMERA_CONSTRAINTS.audio).toBe(false);
    expect(CAMERA_CONSTRAINTS.video).toMatchObject({ facingMode: { ideal: "environment" } });
  });

  it("classifies getUserMedia failures", () => {
    expect(classifyCameraError(named("NotAllowedError"))).toBe("denied");
    expect(classifyCameraError(named("SecurityError"))).toBe("denied");
    expect(classifyCameraError(named("NotFoundError"))).toBe("unsupported");
    expect(classifyCameraError(named("OverconstrainedError"))).toBe("unsupported");
    expect(classifyCameraError(cameraUnsupportedError())).toBe("unsupported");
    expect(classifyCameraError(named("NotReadableError"))).toBe("failed");
    expect(classifyCameraError("boom")).toBe("failed");
    expect(classifyCameraError(null)).toBe("failed");
  });

  it("tells failures apart from working states", () => {
    expect(isCameraFailure("denied")).toBe(true);
    expect(isCameraFailure("failed")).toBe(true);
    expect(isCameraFailure("starting")).toBe(false);
    expect(isCameraFailure("live")).toBe(false);
  });
});
