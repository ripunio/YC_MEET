"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Play,
  Pause,
  RotateCcw,
  Circle,
  Square,
  Download,
  Upload,
  ArrowLeftRight,
  Volume2,
  VolumeX,
} from "lucide-react";

interface ScriptSegment {
  id: number;
  startSec: number;
  endSec: number;
  speaker: "RIPUN" | "VEESHAL";
  text: string;
}

const YC_SCRIPT: ScriptSegment[] = [
  {
    id: 1,
    startSec: 0,
    endSec: 2.5,
    speaker: "RIPUN",
    text: "Hi YC, I'm Ripun.",
  },
  {
    id: 2,
    startSec: 2.5,
    endSec: 8.5,
    speaker: "VEESHAL",
    text: "And I'm Veeshal. We're building Cockpit: a visual remote desktop for cloud servers.",
  },
  {
    id: 3,
    startSec: 8.5,
    endSec: 25,
    speaker: "RIPUN",
    text: "Millions of developers and power users spin up cloud servers every day. But the way we interact with them hasn't evolved in forty years. We're still staring at black text terminals, typing cryptic commands, or suffering through laggy VNC software from 1998.",
  },
  {
    id: 4,
    startSec: 25,
    endSec: 42,
    speaker: "VEESHAL",
    text: "Cockpit changes that. We turn any headless cloud server into a full visual desktop running right inside from your browser. Open a URL, and your remote server feels like a personal laptop with fluid window management and instant performance anywhere.",
  },
  {
    id: 5,
    startSec: 42,
    endSec: 55,
    speaker: "RIPUN",
    text: "Cloud servers have massive compute power, but they've always lacked a human interface. We're building that surface so anyone can use a cloud server as naturally as their own PC.",
  },
  {
    id: 6,
    startSec: 55,
    endSec: 60,
    speaker: "VEESHAL",
    text: "Thanks for watching, we're excited to build Cockpit with YC.",
  },
];

const TOTAL_DURATION = 60;

export default function VideoCallPage() {
  // Call controls state
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);

  // Audio input device selection (for wired mic support)
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>("");
  const [micVolume, setMicVolume] = useState<number>(0);

  // Teleprompter state (elapsed seconds with high resolution)
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Active Live Speaker Role: Who is live on camera right now?
  // "VEESHAL" (Veeshal is default live recording, Ripun is pre-recorded video playback)
  // "RIPUN" (Ripun is live recording, Veeshal is pre-recorded video playback)
  const [activeLiveSpeaker, setActiveLiveSpeaker] = useState<"RIPUN" | "VEESHAL">("VEESHAL");

  // Real-time recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

  // Video files uploaded for each speaker
  const [ripunVideoSrc, setRipunVideoSrc] = useState<string | null>(null);
  const [veeshalVideoSrc, setVeeshalVideoSrc] = useState<string | null>(null);

  // State to preview/hear left attached video audio directly
  const [isPartnerAudioAudible, setIsPartnerAudioAudible] = useState<boolean>(true);

  // Countdown state before start (3, 2, 1)
  const [countdown, setCountdown] = useState<number | null>(null);

  // Video & audio references
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const prerecordedVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const ripunFileInputRef = useRef<HTMLInputElement | null>(null);
  const veeshalFileInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const [hasCameraAccess, setHasCameraAccess] = useState(false);

  // Find active segment based on elapsed time
  const activeSegmentIndex = YC_SCRIPT.findIndex(
    (seg) => elapsedTime >= seg.startSec && elapsedTime < seg.endSec
  );
  const currentSegment =
    activeSegmentIndex !== -1
      ? YC_SCRIPT[activeSegmentIndex]
      : elapsedTime >= TOTAL_DURATION
        ? YC_SCRIPT[YC_SCRIPT.length - 1]
        : YC_SCRIPT[0];

  const nextSegment =
    activeSegmentIndex !== -1 && activeSegmentIndex + 1 < YC_SCRIPT.length
      ? YC_SCRIPT[activeSegmentIndex + 1]
      : null;

  // Segment progress percentage
  const segmentDuration = currentSegment.endSec - currentSegment.startSec;
  const segmentProgress = Math.min(
    100,
    Math.max(0, ((elapsedTime - currentSegment.startSec) / segmentDuration) * 100)
  );

  // Determine prerecorded video source for the partner
  const prerecordedVideoSrc = activeLiveSpeaker === "RIPUN" ? veeshalVideoSrc : ripunVideoSrc;
  const prerecordedSpeakerName = activeLiveSpeaker === "RIPUN" ? "VEESHAL" : "RIPUN";
  const prerecordedFileInputRef = activeLiveSpeaker === "RIPUN" ? veeshalFileInputRef : ripunFileInputRef;

  // Stop recording helper
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPlaying(false);
    }
  };

  // Automatic precision timer with AUTO-END when script completes
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setElapsedTime((prev) => {
        const nextTime = Math.round((prev + 0.1) * 10) / 10;
        if (nextTime >= TOTAL_DURATION) {
          setIsPlaying(false);
          // Auto-stop recording if currently recording
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
          }
          return TOTAL_DURATION;
        }
        return nextTime;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // Enumerate all available audio input devices (Wired Mic, Headset, USB, Built-in)
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const mics = devices.filter((d) => d.kind === "audioinput");
          setAudioDevices(mics);
          if (mics.length > 0 && !selectedAudioDeviceId) {
            setSelectedAudioDeviceId(mics[0].deviceId);
          }
        })
        .catch((err) => console.warn("Failed to enumerate audio devices:", err));
    }
  }, [selectedAudioDeviceId]);

  // CDN URLs for pre-recorded founder takes
  const FOUNDER_VIDEO_URLS = {
    take1: "https://pub-9922dc1fed654b6690fcf27b75ba2b54.r2.dev/founder/1_enhanced.webm",
    take2: "https://pub-9922dc1fed654b6690fcf27b75ba2b54.r2.dev/founder/2_enhanced.webm",
  };

  // Synchronize prerecorded partner video playback with teleprompter timing & speaker turn
  useEffect(() => {
    const video = prerecordedVideoRef.current;
    if (!video || !prerecordedVideoSrc) return;

    if (isPlaying) {
      // Gentle sync: only seek if drift is noticeable (> 0.6s) to avoid buffering/lag
      if (Math.abs(video.currentTime - elapsedTime) > 0.6) {
        video.currentTime = elapsedTime;
      }
      if (video.paused) {
        video.play().catch(() => { });
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [isPlaying, elapsedTime, prerecordedVideoSrc]);

  // Actual start execution after countdown completes
  const executeStartRecording = () => {
    if (!streamRef.current) return;
    try {
      recordedChunksRef.current = [];
      const options: MediaRecorderOptions = {
        mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
          ? "video/webm;codecs=vp9,opus"
          : MediaRecorder.isTypeSupported("video/webm;codecs=h264,opus")
            ? "video/webm;codecs=h264,opus"
            : MediaRecorder.isTypeSupported("video/webm")
              ? "video/webm"
              : "video/mp4",
        videoBitsPerSecond: 10_000_000,
        audioBitsPerSecond: 256_000,
      };

      const recorder = new MediaRecorder(streamRef.current, options);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);

        // If recording Ripun, make it available as Ripun's pre-recorded video for later
        if (activeLiveSpeaker === "RIPUN") {
          setRipunVideoSrc(url);
        } else {
          setVeeshalVideoSrc(url);
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Auto start pitch timer in sync with recording
      setElapsedTime(0);
      setIsPlaying(true);
    } catch (err) {
      console.error("Recording error:", err);
      alert("Could not start recording: " + err);
    }
  };

  // Trigger 3, 2, 1 Countdown before recording starts
  const triggerCountdownAndStart = (record: boolean) => {
    if (record && !streamRef.current) {
      alert("Camera and mic feed not ready yet. Please allow permissions.");
      return;
    }

    setCountdown(3);
    const c3 = setTimeout(() => {
      setCountdown(2);
    }, 1000);

    const c2 = setTimeout(() => {
      setCountdown(1);
    }, 2000);

    const c1 = setTimeout(() => {
      setCountdown(null);
      if (record) {
        executeStartRecording();
      } else {
        setElapsedTime(0);
        setIsPlaying(true);
      }
    }, 3000);

    return () => {
      clearTimeout(c3);
      clearTimeout(c2);
      clearTimeout(c1);
    };
  };

  const downloadRecording = () => {
    if (!recordedVideoUrl) return;
    const a = document.createElement("a");
    a.href = recordedVideoUrl;
    a.download = `cockpit-${activeLiveSpeaker.toLowerCase()}-recording-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleRestart = () => {
    setElapsedTime(0);
    if (prerecordedVideoRef.current) {
      prerecordedVideoRef.current.currentTime = 0;
    }
  };

  const jumpToSegment = (seg: ScriptSegment) => {
    setElapsedTime(seg.startSec);
    if (prerecordedVideoRef.current) {
      prerecordedVideoRef.current.currentTime = seg.startSec;
    }
  };

  // Upload handlers
  const handleVeeshalVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVeeshalVideoSrc(url);
    }
  };

  const handleRipunVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setRipunVideoSrc(url);
    }
  };

  // Switch Live Speaker Role (Ripun <-> Veeshal)
  const toggleLiveSpeakerRole = () => {
    if (isRecording) {
      alert("Please stop the current recording before switching roles.");
      return;
    }
    setActiveLiveSpeaker((prev) => (prev === "RIPUN" ? "VEESHAL" : "RIPUN"));
    setElapsedTime(0);
    setIsPlaying(false);
  };

  // Webcam & Audio Stream Setup
  useEffect(() => {
    let isCancelled = false;

    if (isVideoOn) {
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
        const audioConstraint = selectedAudioDeviceId
          ? {
            deviceId: { exact: selectedAudioDeviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          }
          : true;

        navigator.mediaDevices
          .getUserMedia({
            video: {
              width: { ideal: 3840, min: 1920 },
              height: { ideal: 2160, min: 1080 },
              frameRate: { ideal: 60, min: 30 },
              aspectRatio: { ideal: 16 / 9 },
              facingMode: "user",
            },
            audio: audioConstraint,
          })
          .then((stream) => {
            if (isCancelled) {
              stream.getTracks().forEach((track) => track.stop());
              return;
            }
            streamRef.current = stream;

            if (liveVideoRef.current) {
              liveVideoRef.current.srcObject = stream;
            }
            setHasCameraAccess(true);

            navigator.mediaDevices.enumerateDevices().then((devices) => {
              const mics = devices.filter((d) => d.kind === "audioinput");
              setAudioDevices(mics);
            });

            try {
              const audioCtx = new (window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 64;
              const source = audioCtx.createMediaStreamSource(stream);
              source.connect(analyser);

              audioContextRef.current = audioCtx;
              analyserRef.current = analyser;

              const dataArray = new Uint8Array(analyser.frequencyBinCount);
              const checkVolume = () => {
                if (analyserRef.current) {
                  analyserRef.current.getByteFrequencyData(dataArray);
                  let sum = 0;
                  for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                  }
                  const avg = sum / dataArray.length;
                  setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
                  animationFrameRef.current = requestAnimationFrame(checkVolume);
                }
              };
              checkVolume();
            } catch (e) {
              console.warn("Audio meter setup error:", e);
            }
          })
          .catch(() => {
            navigator.mediaDevices
              ?.getUserMedia({
                video: true,
                audio: true,
              })
              .then((fallbackStream) => {
                if (isCancelled) {
                  fallbackStream.getTracks().forEach((t) => t.stop());
                  return;
                }
                streamRef.current = fallbackStream;
                if (liveVideoRef.current) {
                  liveVideoRef.current.srcObject = fallbackStream;
                }
                setHasCameraAccess(true);
              })
              .catch(() => {
                if (!isCancelled) {
                  setHasCameraAccess(false);
                }
              });
          });
      }
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = null;
      }
    }

    return () => {
      isCancelled = true;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => { });
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isVideoOn, selectedAudioDeviceId]);

  // Toggle mic track enabled/disabled directly on stream
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMicOn;
      });
    }
  }, [isMicOn]);

  const formatSeconds = (sec: number) => {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? "0" : ""}${rem}`;
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-black text-white select-none relative">
      {/* 3, 2, 1 Countdown Overlay */}
      {countdown !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md">
          <div className="flex flex-col items-center animate-pulse">
            <span
              className="text-9xl md:text-[180px] font-black text-white tracking-tighter leading-none"
              style={{ fontFamily: "monospace" }}
            >
              {countdown}
            </span>
            <span className="text-sm md:text-base font-bold uppercase tracking-widest text-white/70 mt-4">
              Get Ready to Pitch ({activeLiveSpeaker} LIVE)...
            </span>
          </div>
        </div>
      )}

      {/* Hidden file inputs for pre-recorded videos */}
      <input
        ref={veeshalFileInputRef}
        type="file"
        accept="video/*"
        onChange={handleVeeshalVideoUpload}
        className="hidden"
      />
      <input
        ref={ripunFileInputRef}
        type="file"
        accept="video/*"
        onChange={handleRipunVideoUpload}
        className="hidden"
      />

      {/* ================= TOP INTELLIGENT TELEPROMPTER ================= */}
      <section className="relative z-30 w-full bg-black px-6 pt-3 pb-4 border-b border-white/5">
        <div className="mx-auto max-w-5xl">
          {/* Top prompter metadata bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {/* Turn Indicator */}
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center justify-center h-8 px-3.5 font-bold text-xs tracking-wider text-black bg-white shadow-lg transition-colors"
                  style={{ borderRadius: "0px" }}
                >
                  {currentSegment.speaker} SPEAKING
                </div>

                <span className="text-xs text-white/70 font-mono">
                  [{formatSeconds(currentSegment.startSec)} - {formatSeconds(currentSegment.endSec)}]
                </span>
              </div>

              {/* Recording Status indicator badge */}
              {isRecording && (
                <div
                  className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 text-xs font-bold text-white tracking-wider animate-pulse shadow-md"
                  style={{ borderRadius: "0px" }}
                >
                  <Circle className="h-2.5 w-2.5 fill-white text-white" />
                  REC ACTIVE ({activeLiveSpeaker})
                </div>
              )}
            </div>

            {/* Total Duration, Timer & Playback Controls */}
            <div className="flex items-center gap-3">
              {/* Switchable Live Speaker Toggle Button */}
              <button
                onClick={toggleLiveSpeakerRole}
                disabled={isRecording || countdown !== null}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-bold bg-zinc-900 border border-white/20 hover:border-white text-white transition disabled:opacity-50"
                style={{ borderRadius: "0px" }}
                title="Switch which person is live recording vs pre-recorded video"
              >
                <ArrowLeftRight className="h-3 w-3 text-white" />
                <span>Live: {activeLiveSpeaker}</span>
              </button>

              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold px-3 py-1 bg-transparent text-white">
                <span className={isPlaying ? "text-white animate-pulse" : "text-white/40"}>
                  ●
                </span>
                <span>
                  {formatSeconds(elapsedTime)} / {formatSeconds(TOTAL_DURATION)}
                </span>
              </div>

              {/* Record / Stop Button */}
              <button
                onClick={isRecording ? stopRecording : () => triggerCountdownAndStart(true)}
                disabled={countdown !== null}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold transition shadow-sm ${isRecording
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : countdown !== null
                    ? "bg-white/40 text-black cursor-not-allowed"
                    : "bg-white text-black hover:bg-white/90"
                  }`}
                style={{ borderRadius: "0px" }}
                title={isRecording ? "Stop recording session" : `Record live ${activeLiveSpeaker} camera feed`}
              >
                {isRecording ? (
                  <>
                    <Square className="h-3 w-3 fill-current" /> Stop Rec
                  </>
                ) : (
                  <>
                    <Circle className="h-3 w-3 fill-red-600 text-red-600" /> Record {activeLiveSpeaker}
                  </>
                )}
              </button>

              {/* Play / Pause / Reset button */}
              <div className="flex items-center gap-1 bg-transparent">
                <button
                  onClick={() => {
                    if (isPlaying) {
                      setIsPlaying(false);
                    } else {
                      triggerCountdownAndStart(false);
                    }
                  }}
                  disabled={countdown !== null}
                  className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold text-white transition ${isPlaying
                    ? "bg-white/10 hover:bg-white/20"
                    : "bg-white/20 hover:bg-white/30"
                    }`}
                  style={{ borderRadius: "0px" }}
                  title={isPlaying ? "Pause prompter" : "Start automated prompter"}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 fill-current" /> Start Pitch
                    </>
                  )}
                </button>

                <button
                  onClick={handleRestart}
                  className="p-1.5 text-white/70 hover:text-white transition"
                  style={{ borderRadius: "0px" }}
                  title="Reset to 00:00"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Download link if recording exists */}
              {recordedVideoUrl && (
                <button
                  onClick={downloadRecording}
                  className="flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2.5 py-1 text-xs font-semibold text-white transition border border-white/20"
                  style={{ borderRadius: "0px" }}
                  title="Download recorded take"
                >
                  <Download className="h-3.5 w-3.5" /> Save {activeLiveSpeaker} Take
                </button>
              )}
            </div>
          </div>

          {/* Segment Progress Micro-bar - Pure White */}
          <div className="w-full bg-white/10 h-1 overflow-hidden mb-3" style={{ borderRadius: "0px" }}>
            <div
              className="h-full bg-white transition-all duration-100"
              style={{ width: `${segmentProgress}%` }}
            />
          </div>

          {/* Big White Teleprompter Text */}
          <div className="min-h-[70px] flex items-center">
            <p className="text-xl md:text-2xl lg:text-[28px] font-semibold tracking-tight text-white leading-snug drop-shadow-md font-sans">
              &ldquo;{currentSegment.text}&rdquo;
            </p>
          </div>

          {/* What's Coming Next */}
          <div className="mt-2.5 flex items-center justify-between pt-2 text-xs">
            <div className="flex items-center gap-2 truncate">
              <span className="font-bold text-zinc-500 uppercase tracking-wider text-[10px]">
                Coming Next:
              </span>
              {nextSegment ? (
                <span className="text-zinc-300 font-medium truncate">
                  <strong className="text-white">{nextSegment.speaker}</strong>: &ldquo;
                  {nextSegment.text.slice(0, 75)}...&rdquo;
                </span>
              ) : (
                <span className="text-emerald-400 font-bold tracking-wider">
                  ✓ FINISHED (Recording auto-saved!)
                </span>
              )}
            </div>

            {/* Quick Segment Jump Pills */}
            <div className="hidden md:flex items-center gap-1 shrink-0 ml-4">
              {YC_SCRIPT.map((seg, idx) => (
                <button
                  key={seg.id}
                  onClick={() => jumpToSegment(seg)}
                  className={`h-1.5 transition-all ${idx === activeSegmentIndex
                    ? "w-6 bg-white"
                    : idx < activeSegmentIndex
                      ? "w-2 bg-zinc-600"
                      : "w-2 bg-zinc-800 hover:bg-zinc-700"
                    }`}
                  style={{ borderRadius: "0px" }}
                  title={`${seg.speaker}: ${formatSeconds(seg.startSec)}s`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= BORDERLESS LANDSCAPE VIDEO STAGE (16:9 NATIVE) ================= */}
      <main className="flex flex-1 items-center justify-center p-4 md:p-6 overflow-hidden bg-black">
        <div className="flex w-full h-full max-w-7xl items-center justify-center gap-4 md:gap-6">
          {/* ================= LEFT PARTITION: PARTNER / PRE-RECORDED VIDEO ================= */}
          <div className="flex flex-col gap-2 w-56 sm:w-72 md:w-80 lg:w-96 shrink-0">
            <div
              className="relative aspect-video w-full overflow-hidden bg-zinc-950 flex flex-col justify-between p-4 border border-white/5"
              style={{ borderRadius: "0px" }}
            >
              {/* If Video file is loaded, play it synced */}
              {prerecordedVideoSrc ? (
                <video
                  ref={prerecordedVideoRef}
                  src={prerecordedVideoSrc}
                  playsInline
                  preload="auto"
                  crossOrigin="anonymous"
                  muted={!isPartnerAudioAudible}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div
                    className="flex h-16 w-16 items-center justify-center bg-black border border-white/20 text-sm font-bold tracking-widest text-white"
                    style={{ borderRadius: "0px" }}
                  >
                    {prerecordedSpeakerName[0]}
                  </div>
                  <button
                    onClick={() => prerecordedFileInputRef.current?.click()}
                    className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:text-white transition"
                    style={{ borderRadius: "0px" }}
                  >
                    <Upload className="h-3 w-3" /> Select {prerecordedSpeakerName} Video
                  </button>
                </div>
              )}

              {/* Simple Clean Name Tag inside video */}
              <div className="relative z-10 flex items-center justify-between mt-auto">
                <span
                  className="bg-black/90 px-2.5 py-1 text-xs font-semibold text-white tracking-wider flex items-center gap-1.5"
                  style={{ borderRadius: "0px" }}
                >
                  <span>{prerecordedSpeakerName}</span>
                </span>

                {currentSegment.speaker === prerecordedSpeakerName && (
                  <span
                    className="bg-white px-2 py-0.5 text-[10px] font-bold text-black tracking-wider"
                    style={{ borderRadius: "0px" }}
                  >
                    SPEAKING
                  </span>
                )}
              </div>
            </div>

            {/* Controls Placed Below Video */}
            <div className="flex flex-col gap-1.5 w-full">
              {prerecordedVideoSrc && (
                <div className="flex items-center gap-1.5 w-full">
                  <button
                    onClick={() => setIsPartnerAudioAudible(!isPartnerAudioAudible)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-bold border transition ${isPartnerAudioAudible
                      ? "bg-white text-black border-white"
                      : "bg-zinc-950 text-white/70 border-white/20 hover:text-white hover:border-white/40"
                      }`}
                    style={{ borderRadius: "0px" }}
                    title={isPartnerAudioAudible ? "Mute partner video audio" : "Hear partner video audio"}
                  >
                    {isPartnerAudioAudible ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                    <span>{isPartnerAudioAudible ? "Sound On" : "Muted"}</span>
                  </button>

                  <button
                    onClick={() => {
                      const v = prerecordedVideoRef.current;
                      if (!v) return;
                      if (v.paused) {
                        v.play().catch(() => { });
                      } else {
                        v.pause();
                      }
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-bold text-white border border-white/20 hover:border-white transition"
                    style={{ borderRadius: "0px" }}
                    title="Play/Pause left video directly to listen"
                  >
                    <Play className="h-3 w-3 fill-current" />
                    <span>Play / Pause</span>
                  </button>

                  <button
                    onClick={() => prerecordedFileInputRef.current?.click()}
                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-bold text-white border border-white/20 hover:border-white transition"
                    style={{ borderRadius: "0px" }}
                    title="Choose a different video file"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Quick load pre-recorded takes directly from Cloud CDN */}
              <div className="flex items-center gap-1.5 w-full">
                <button
                  onClick={() => {
                    if (activeLiveSpeaker === "RIPUN") {
                      setVeeshalVideoSrc(FOUNDER_VIDEO_URLS.take1);
                    } else {
                      setRipunVideoSrc(FOUNDER_VIDEO_URLS.take1);
                    }
                  }}
                  className={`flex-1 py-1.5 px-2 text-[10px] font-bold border transition flex items-center justify-center gap-1.5 truncate ${prerecordedVideoSrc === FOUNDER_VIDEO_URLS.take1
                      ? "bg-white text-black border-white"
                      : "bg-zinc-950 text-white/80 border-white/20 hover:bg-zinc-900 hover:text-white hover:border-white/40"
                    }`}
                  style={{ borderRadius: "0px" }}
                  title="Load 1_enhanced.webm directly from CDN"
                >
                  <Video className="h-3 w-3 shrink-0" />
                  <span className="truncate">Load Take 1 (1_enhanced)</span>
                </button>

                <button
                  onClick={() => {
                    if (activeLiveSpeaker === "RIPUN") {
                      setVeeshalVideoSrc(FOUNDER_VIDEO_URLS.take2);
                    } else {
                      setRipunVideoSrc(FOUNDER_VIDEO_URLS.take2);
                    }
                  }}
                  className={`flex-1 py-1.5 px-2 text-[10px] font-bold border transition flex items-center justify-center gap-1.5 truncate ${prerecordedVideoSrc === FOUNDER_VIDEO_URLS.take2
                      ? "bg-white text-black border-white"
                      : "bg-zinc-950 text-white/80 border-white/20 hover:bg-zinc-900 hover:text-white hover:border-white/40"
                    }`}
                  style={{ borderRadius: "0px" }}
                  title="Load 2_enhanced.webm directly from CDN"
                >
                  <Video className="h-3 w-3 shrink-0" />
                  <span className="truncate">Load Take 2 (2_enhanced)</span>
                </button>
              </div>
            </div>
          </div>

          {/* ================= RIGHT PARTITION: MAIN LANDSCAPE (LIVE SPEAKER RECORDING) ================= */}
          <div
            className={`relative aspect-video flex-1 max-h-full overflow-hidden bg-zinc-950 flex flex-col justify-between p-4 transition-all ${isRecording ? "border border-red-600/60 shadow-lg shadow-red-600/10" : "border border-white/5"
              }`}
            style={{ borderRadius: "0px" }}
          >
            {/* Live Camera Stream or Clean Avatar Fallback */}
            <div className="absolute inset-0 z-0 flex items-center justify-center bg-black">
              {isVideoOn ? (
                <>
                  <video
                    ref={liveVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full object-cover -scale-x-100 ${!hasCameraAccess ? "hidden" : "block"
                      }`}
                  />
                  {!hasCameraAccess && (
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div
                        className="flex h-20 w-20 items-center justify-center bg-black border border-white/20 text-lg font-bold tracking-widest text-white"
                        style={{ borderRadius: "0px" }}
                      >
                        {activeLiveSpeaker[0]}
                      </div>
                      <span className="text-xs text-white/40">Camera Connecting...</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2">
                  <div
                    className="flex h-20 w-20 items-center justify-center bg-black text-xl font-bold text-white border border-white/20"
                    style={{ borderRadius: "0px" }}
                  >
                    {activeLiveSpeaker[0]}
                  </div>
                  <span className="text-xs text-white/50">Camera turned off</span>
                </div>
              )}
            </div>

            {/* Simple Clean Name Tag, Mic Level & Recording Status */}
            <div className="relative z-10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="bg-black/80 px-3 py-1 text-xs font-semibold text-white tracking-wider flex items-center gap-2"
                  style={{ borderRadius: "0px" }}
                >
                  {isRecording && <span className="h-2 w-2 bg-red-600 animate-pulse" />}
                  {activeLiveSpeaker} (LIVE YOU)
                </span>

                {/* Real-time Wired Mic Input Level Meter */}
                <div
                  className="flex items-center gap-1 bg-black/80 px-2 py-1 border border-white/10"
                  style={{ borderRadius: "0px" }}
                  title="Wired Mic Input Signal Level"
                >
                  <Mic className="h-3 w-3 text-white/60" />
                  <div className="w-12 h-1.5 bg-white/20 overflow-hidden" style={{ borderRadius: "0px" }}>
                    <div
                      className={`h-full transition-all duration-75 ${micVolume > 75 ? "bg-red-500" : micVolume > 15 ? "bg-emerald-400" : "bg-white/40"
                        }`}
                      style={{ width: `${Math.max(5, micVolume)}%` }}
                    />
                  </div>
                </div>
              </div>

              {isRecording && (
                <span
                  className="bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white tracking-wider animate-pulse"
                  style={{ borderRadius: "0px" }}
                >
                  LIVE RECORDING
                </span>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ================= CLEAN CALL CONTROLS ================= */}
      <footer className="relative z-30 flex h-18 w-full items-center justify-between bg-black px-6 pb-2 border-t border-white/5">
        {/* Left: Wired Microphone Device Selector & Role indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-white/60 uppercase font-mono tracking-wider">
              Mic:
            </label>
            <select
              value={selectedAudioDeviceId}
              onChange={(e) => setSelectedAudioDeviceId(e.target.value)}
              className="bg-zinc-950 border border-white/20 text-white text-xs px-2.5 py-1.5 focus:outline-none focus:border-white font-mono max-w-[200px] truncate"
              style={{ borderRadius: "0px" }}
            >
              {audioDevices.length > 0 ? (
                audioDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label || `Microphone ${i + 1}`}
                  </option>
                ))
              ) : (
                <option value="">Default Microphone</option>
              )}
            </select>
          </div>
        </div>

        {/* Center: Main Toggles */}
        <div className="flex items-center gap-3">
          {/* Mic */}
          <button
            onClick={() => setIsMicOn(!isMicOn)}
            className={`flex h-11 w-11 items-center justify-center transition shadow-md ${isMicOn
              ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
              : "bg-red-500 text-white hover:bg-red-600"
              }`}
            style={{ borderRadius: "0px" }}
            title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
          >
            {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>

          {/* Camera */}
          <button
            onClick={() => setIsVideoOn(!isVideoOn)}
            className={`flex h-11 w-11 items-center justify-center transition shadow-md ${isVideoOn
              ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
              : "bg-red-500 text-white hover:bg-red-600"
              }`}
            style={{ borderRadius: "0px" }}
            title={isVideoOn ? "Turn Off Video" : "Turn On Video"}
          >
            {isVideoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
          </button>

          {/* Switch Speaker Placement / Role */}
          <button
            onClick={toggleLiveSpeakerRole}
            disabled={isRecording}
            className="flex items-center gap-1.5 h-11 px-4 bg-zinc-900 hover:bg-zinc-800 border border-white/20 text-white text-xs font-bold transition disabled:opacity-50"
            style={{ borderRadius: "0px" }}
            title="Switch Live Speaker role between Ripun and Veeshal"
          >
            <ArrowLeftRight className="h-4 w-4" />
            <span>Switch: {activeLiveSpeaker === "RIPUN" ? "Veeshal Live" : "Ripun Live"}</span>
          </button>

          {/* New Session */}
          <button
            onClick={() => {
              if (confirm("Reset and start new session?")) {
                window.location.reload();
              }
            }}
            className="flex items-center gap-2 h-11 px-5 bg-red-600 hover:bg-red-700 text-white font-medium text-sm transition ml-2"
            style={{ borderRadius: "0px" }}
            title="End Session"
          >
            <PhoneOff className="h-4 w-4" />
            <span>New Session</span>
          </button>
        </div>

        {/* Right: Info */}
        <div className="w-[200px] hidden md:block text-right text-[11px] text-white/40 font-mono">
          Auto-ends at 1:00
        </div>
      </footer>
    </div>
  );
}
