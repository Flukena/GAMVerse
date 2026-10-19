import { useEffect, useRef } from "react";
import { DeviceSettingsMicrophoneMeter } from "./DeviceSettingsMicrophoneMeter";

export function DeviceSettingsPreview({ stream }: Readonly<{ stream: MediaStream | null }>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    return () => { video.srcObject = null; };
  }, [stream]);
  const hasVideo = Boolean(stream?.getVideoTracks().length);
  return <div className="device-settings-preview">
    <video ref={videoRef} autoPlay muted playsInline hidden={!hasVideo} aria-label="Your private camera preview" />
    {!hasVideo && <p>Camera preview is off.</p>}
    {stream && stream.getAudioTracks().length > 0 && <DeviceSettingsMicrophoneMeter stream={stream} />}
  </div>;
}
