import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import {
  ButtonHTMLAttributes,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DiskutilOutput, Partition } from './diskutilTypes';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEject, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { FileStatInfo } from 'sharedTypes';

function SdCardPicker() {
  const [drives, setDrives] = useState<Partition[]>([]);
  const [selectedMountPoint, setSelectedMountPoint] = useState<string | null>(
    null
  );
  const selectedDrive = drives.find((d) => d.MountPoint === selectedMountPoint);

  function loadDrives() {
    window.electron.ipcRenderer
      .invoke('listDrives')
      .then(({ AllDisksAndPartitions }: DiskutilOutput) => {
        setDrives(
          AllDisksAndPartitions.filter((d) => d.OSInternal === false)
            .flatMap((f) => f.Partitions)
            .filter((f) => f.MountPoint && f.MountPoint.startsWith('/Volumes/'))
        );
      });
  }

  console.log(drives);

  useEffect(() => {
    loadDrives();

    const timer = setInterval(() => loadDrives(), 60000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div>
      <div
        className="row"
        style={{
          margin: '0 20px',
          marginTop: '20px',
        }}
      >
        <h2>Välj minneskort</h2>
        <button onClick={loadDrives} className="button">
          Ladda om
        </button>
      </div>

      {drives.length === 0 ? (
        <div style={{ margin: '0 20px' }}>Inga minneskort hittades</div>
      ) : (
        <div className="cardList">
          {drives.map((drive) => (
            <DriveRow
              key={drive.MountPoint}
              drive={drive}
              open={() => setSelectedMountPoint(drive.MountPoint!)}
              reloadDrives={loadDrives}
            />
          ))}
        </div>
      )}

      {selectedDrive == null ? null : <DriveInfo drive={selectedDrive} />}
    </div>
  );
}

function DriveInfo({ drive }: { drive: Partition }) {
  const [files, setDriveFiles] = useState<FileStatInfo[] | null>(null);
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const [expandedVideoDates, setExpandedVideoDates] = useState<string[]>([]);
  const [progress, setProgress] = useState<{
    progress: number;
    message: string;
    success?: boolean;
  } | null>(null);
  const [deleteOnMove, setDeleteOnMove] = useState(true);

  useEffect(() => {
    window.electron.ipcRenderer
      .invoke('fetchDriveFiles', drive.MountPoint)
      .then((files: FileStatInfo[]) => {
        files.sort((a, b) => a.createdTime - b.createdTime);
        setDriveFiles(files);
      });
  }, []);

  useEffect(() => {
    window.electron.ipcRenderer.on('importStatus', (status) => {
      setProgress(status as { progress: number; message: string });
    });
  }, []);

  const LATE_NIGHT_TIME_OFFSET = 1000 * 60 * 60 * 2;

  const dateStats = new Map<
    string,
    { date: string; exts: Map<string, FileStatInfo[]> }
  >();
  files?.forEach((file) => {
    const ext = file.path.split('.').pop()!.toLowerCase();
    const date = new Date(file.createdTime - LATE_NIGHT_TIME_OFFSET);
    const dateStr = date.toLocaleDateString('sv-SE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Europe/Stockholm',
    });

    const existing = dateStats.get(dateStr);
    if (existing == null)
      dateStats.set(dateStr, { date: dateStr, exts: new Map([[ext, [file]]]) });
    else {
      const existingExt = existing.exts.get(ext);
      if (existingExt == null) existing.exts.set(ext, [file]);
      else existingExt.push(file);
    }
  });

  return (
    <div
      style={{
        margin: '0 20px',
        marginTop: '20px',
      }}
    >
      <div className="row2">
        <input
          type="checkbox"
          id="deleteOnMove"
          checked={deleteOnMove}
          onChange={(e) => setDeleteOnMove(e.target.checked)}
        />
        <label htmlFor="deleteOnMove">Radera filer från minneskortet</label>
      </div>

      {[...dateStats.entries()].map(([, date]) => {
        const jpgs = date.exts.get('jpg') ?? [];

        const jpgIndexes =
          jpgs.length === 0
            ? []
            : jpgs.length === 1
            ? [0]
            : jpgs.length === 2
            ? [0, 1]
            : [0, Math.floor(jpgs.length / 2), jpgs.length - 1];

        return (
          <div key={date.date} style={{ marginBottom: '30px' }}>
            <h2>{date.date}</h2>

            {Array.from(date.exts.entries()).map(([ext, list]) => (
              <div style={{ justifyContent: 'flex-start' }} className="row">
                <div style={{ minWidth: '70px' }}>
                  {ext === 'raf'
                    ? 'RAW'
                    : ext === 'jpg'
                    ? 'Bilder'
                    : ext === 'mp4'
                    ? 'Filmer'
                    : ext}
                  {': '}
                </div>
                {list.length}
              </div>
            ))}

            {jpgIndexes.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  flexDirection: 'row',
                  gap: '10px',
                  marginTop: '10px',
                }}
              >
                {progress != null
                  ? null
                  : expandedDates.includes(date.date)
                  ? jpgs.map((jpg) => <Image path={jpg.path} key={jpg.path} />)
                  : jpgIndexes.map((i) => (
                      <Image path={jpgs[i].path} key={jpgs[i].path} />
                    ))}

                {progress != null
                  ? null
                  : jpgIndexes.length !== jpgs.length &&
                    !expandedDates.includes(date.date) && (
                      <button
                        style={{
                          alignSelf: 'center',
                          border: 'none',
                          padding: '5px 10px',
                          backgroundColor: 'white',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        onClick={() =>
                          setExpandedDates((old) => old.concat(old, date.date))
                        }
                      >
                        Visa alla bilder ({jpgs.length - jpgIndexes.length}{' '}
                        fler)
                      </button>
                    )}
              </div>
            )}

            {progress != null
              ? null
              : expandedVideoDates.includes(date.date)
              ? date.exts
                  .get('mp4')
                  ?.map((file) => (
                    <video
                      style={{ marginTop: '10px', marginRight: '10px' }}
                      src={`file:${file.path}`}
                      height="100px"
                      loop
                      muted
                      autoPlay
                      onClick={() =>
                        window.electron.ipcRenderer.invoke(
                          'openFile',
                          `file:${file.path}`
                        )
                      }
                    />
                  )) ?? null
              : null}

            {progress != null
              ? null
              : (date.exts.get('mp4')?.length ?? 0) > 0 &&
                !expandedVideoDates.includes(date.date) && (
                  <video
                    style={{ marginTop: '10px', marginRight: '10px' }}
                    src={`file:${date.exts.get('mp4')![0].path}`}
                    height="100px"
                    loop
                    autoPlay
                    muted
                    onClick={() =>
                      window.electron.ipcRenderer.invoke(
                        'openFile',
                        `file:${date.exts.get('mp4')![0].path}`
                      )
                    }
                  />
                )}

            {progress != null
              ? null
              : (date.exts.get('mp4')?.length ?? 0) > 1 &&
                !expandedVideoDates.includes(date.date) && (
                  <button
                    style={{
                      alignSelf: 'center',
                      border: 'none',
                      padding: '5px 10px',
                      backgroundColor: 'white',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                    onClick={() =>
                      setExpandedVideoDates((old) => old.concat(old, date.date))
                    }
                  >
                    + {date.exts.get('mp4')!.length - 1} fler filmer
                  </button>
                )}
          </div>
        );
      })}

      <DebouncedButton
        style={{
          position: 'relative',
        }}
        className="fullWidthButton"
        onClick={() => {
          if (progress == null || progress.progress === 100) {
            setExpandedVideoDates([]);
            setExpandedDates([]);
            setProgress(null);

            window.electron.ipcRenderer.sendMessage(
              'startImport',
              drive.MountPoint,
              deleteOnMove
            );
          }
        }}
      >
        {progress == null ? null : (
          <div
            style={{
              width: `${progress.progress}%`,
              transitionProperty: 'width',
              transitionDuration: '0.2s',
              transitionTimingFunction: 'linear',
              backgroundColor:
                progress.success === false ? '#a13533' : '#49a133',
              position: 'absolute',
              top: 0,
              left: 0,
              bottom: 0,
            }}
          ></div>
        )}

        {progress == null ? (
          'Starta import'
        ) : (
          <div style={{ position: 'relative' }}>
            {Math.round(progress.progress)}% {progress.message}
          </div>
        )}
      </DebouncedButton>
    </div>
  );
}

function DebouncedButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const lastPressTime = useRef(0);

  return (
    <button
      {...props}
      onClick={(ev) => {
        const now = performance.now();
        if (now - lastPressTime.current < 2000) return;
        lastPressTime.current = now;

        props.onClick?.(ev);
      }}
    />
  );
}

function Image({ path }: { path: string }) {
  return (
    <img
      src={`file:${path}`}
      style={{ height: '100px' }}
      onClick={() => {
        window.electron.ipcRenderer.invoke('openFile', path);
      }}
    />
  );
}

function DriveRow({
  drive,
  open,
  reloadDrives,
}: {
  drive: Partition;
  open: () => void;
  reloadDrives: () => void;
}) {
  const [edjectingDrive, setEdjectingDrive] = useState('');
  return (
    <div className="row" style={{ justifyContent: 'flex-start' }}>
      <button className="textbutton" onClick={open}>
        {drive.MountPoint!.replace('/Volumes/', '')}
        <span style={{ marginLeft: '8px' }}>
          {Math.round(drive.Size / (1000 * 1000 * 1000))}GB
        </span>
      </button>
      <button
        className="iconbutton"
        style={{ marginLeft: '10px' }}
        onClick={() => {
          if (edjectingDrive === drive.DeviceIdentifier) return;
          setEdjectingDrive(drive.DeviceIdentifier);
          window.electron.ipcRenderer
            .invoke('unmountDisk', drive.DeviceIdentifier)
            .then(() => {
              setEdjectingDrive('');
              reloadDrives();
            })
            .catch((err) => {
              setEdjectingDrive('');
              reloadDrives();
              alert(err);
            });
        }}
      >
        <FontAwesomeIcon
          spin={edjectingDrive === drive.DeviceIdentifier}
          icon={edjectingDrive === drive.DeviceIdentifier ? faSpinner : faEject}
        />
      </button>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SdCardPicker />} />
      </Routes>
    </Router>
  );
}
