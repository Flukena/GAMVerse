import { DeviceSettingsDialog, type DeviceSettingsDialogProps } from "./DeviceSettingsDialog";

export interface PrejoinDialogProps extends Pick<DeviceSettingsDialogProps, "onApply" | "createController"> {
  onClose(): void;
  onJoin(): void;
}

export function PrejoinDialog(props: Readonly<PrejoinDialogProps>) {
  return <DeviceSettingsDialog {...props} mode="prejoin" />;
}
