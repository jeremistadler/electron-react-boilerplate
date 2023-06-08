export interface DiskutilOutput {
  AllDisks: string[];
  AllDisksAndPartitions: AllDisksAndPartition[];
  VolumesFromDisks: string[];
  WholeDisks: string[];
}

export interface AllDisksAndPartition {
  Content: string;
  DeviceIdentifier: string;
  OSInternal: boolean;
  Partitions: Partition[];
  Size: number;
  APFSPhysicalStores?: APFSPhysicalStore[];
  APFSVolumes?: APFSVolume[];
}

export interface APFSPhysicalStore {
  DeviceIdentifier: string;
}

export interface APFSVolume {
  CapacityInUse: number;
  DeviceIdentifier: string;
  DiskUUID: string;
  MountPoint?: string;
  MountedSnapshots?: MountedSnapshot[];
  OSInternal: boolean;
  Size: number;
  VolumeName: string;
  VolumeUUID: string;
}

export interface MountedSnapshot {
  Sealed: string;
  SnapshotBSD: string;
  SnapshotMountPoint: string;
  SnapshotName: string;
  SnapshotUUID: string;
}

export interface Partition {
  Content: string;
  DeviceIdentifier: string;
  DiskUUID?: string;
  Size: number;
  MountPoint?: string;
  VolumeName?: string;
  VolumeUUID?: string;
}
