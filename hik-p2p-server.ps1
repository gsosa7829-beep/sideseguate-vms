$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$ivmsDir = "C:\Program Files (x86)\iVMS-4200 Site\iVMS-4200 Client\Client"
$cloudBinDir = Join-Path $scriptRoot "cloud-p2p-runtime\bin"
$cloudZipPath = Join-Path $scriptRoot "cloud-p2p-runtime\hik-sdk-x64.zip"

if (($env:FORCE_CLOUD_SDK -ne "1") -and (Test-Path (Join-Path $ivmsDir "NetStream.dll"))) {
    $clientDir = $ivmsDir
} else {
    if (-not (Test-Path (Join-Path $cloudBinDir "NetStream.dll"))) {
        Write-Output "[HikP2PServer] Extracting cloud P2P SDK runtime from $cloudZipPath ..."
        New-Item -ItemType Directory -Force -Path $cloudBinDir | Out-Null
        Expand-Archive -Path $cloudZipPath -DestinationPath $cloudBinDir -Force
    }
    $clientDir = $cloudBinDir
}

$env:PATH = "$clientDir;$env:PATH"
Set-Location $clientDir
Write-Output "[HikP2PServer] Using SDK directory: $clientDir"

# Extract latest P2P secret from opensdk.log if available, otherwise use verified fallback
$p2pDataStr = "{94,51,-11,81,-8,-120,2,-3,-89,-109,-65,48,118,-69,55,95,-6,32,44,62,87,6,-90,-123,-95,63,-17,84,4,50,-19,50}"
$p2pSaltIndex = 7
$p2pUserId = "a94b09c1bc384dc8a58206aff41463b4"
$p2pLinkKey = "fed314e045320b7595100e9544d33022b7209cdd175a402a400e9037a2963210"
$devPublicIp = "190.148.33.229"

try {
    $logPath = Join-Path $clientDir "log\opensdk\opensdk.log"
    if (Test-Path $logPath) {
        $fs = [System.IO.File]::Open($logPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $fs.Seek([Math]::Max(0, $fs.Length - 400000), [System.IO.SeekOrigin]::Begin) | Out-Null
        $sr = New-Object System.IO.StreamReader($fs)
        $tail = $sr.ReadToEnd()
        $sr.Close()
        $fs.Close()

        $matchesSecret = [regex]::Matches($tail, '"userId":"([a-f0-9]+)","data":"(\{[0-9,\-]+\})","version":0,"expireTime":\d+,"saltIndex":(\d+)')
        if ($matchesSecret.Count -gt 0) {
            $last = $matchesSecret[$matchesSecret.Count - 1]
            $p2pUserId = $last.Groups[1].Value
            $p2pDataStr = $last.Groups[2].Value
            $p2pSaltIndex = [int]$last.Groups[3].Value
        }
    }
} catch {}

Write-Output "[HikP2PServer] Using userId=$p2pUserId saltIndex=$p2pSaltIndex"

$code = @"
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public class HikNativeP2PServer {
    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate void MsgHandler(int iIndex, int iMsgType, int iErrorCode, string pMessageInfo, IntPtr pUser);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public static extern int NS_InitLib(string szExePath);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int NS_InitPPVSLib();

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int NS_SetMessageHandler(MsgHandler pfn, IntPtr pUser);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public static extern int NS_SetSpecialInfo(string szInfo, int iType);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public static extern int NS_SetP2PV3ConfigInfo(string szConfig);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int NS_AllocSession();

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public static extern int NS_SetSessionId(int iIndex, string szSessionId);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public static extern int NS_StartPreConnection(int iIndex, string szClientId, string szDevInfo, string szServerInfo, string szP2PServerInfo);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall, CharSet = CharSet.Ansi)]
    public static extern int NS_Play_V17(int iIndex, IntPtr hWnd, string szClientId, int iPlayType, string szDevInfo, string szServerInfo, string szStartTime, string szStopTime, int iForceStreamType);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int NS_JPEGCaptureEx(int iIndex, out IntPtr ppBuf, out int pSize);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int NS_JPEGCaptureExFree(IntPtr pBuf);

    [DllImport("NetStream.dll", CallingConvention = CallingConvention.StdCall)]
    public static extern int NS_Stop_V17(int iIndex);

    private static MsgHandler _msgDel;
    private static int[] _sessions = new int[5];
    private static IntPtr[] _hwnds = new IntPtr[5];
    private static Form[] _forms = new Form[5];
    private static byte[][] _frames = new byte[5][];
    private static long[] _frameCounts = new long[5];
    private static DateTime[] _lastFrameTime = new DateTime[5];
    private static DateTime[] _lastReconnectTime = new DateTime[5];
    private static object _lock = new object();

    public static string UserId;
    public static string P2PLinkKey;
    public static string DevPublicIp;
    public static string SrvInfoJson;
    public static byte[] WebAppHtmlBytes;

    public static void OnMsg(int iIndex, int iMsgType, int iErrorCode, string pMessageInfo, IntPtr pUser) {
        // Keep delegate alive
    }

    public static string BuildDevInfo(int ch) {
        int streamType = (ch == 1) ? 2 : 2; // Sub-stream for low-latency multi-channel P2P
        return "{\"Channel\":" + ch +
            ",\"ChannelSerial\":\"FB2200254\",\"ChannelType\":1,\"ClientType\":19,\"CloseKeyAuth\":0," +
            "\"DirectPlayback_EndFlag\":true,\"FastStream\":0,\"Finterval\":0,\"ISP\":0," +
            "\"InnerCmdPort\":9010,\"InnerIP\":\"192.168.1.81\",\"InnerStreamPort\":9020," +
            "\"InternetCmdPort\":45570,\"InternetIP\":\"" + DevPublicIp + "\",\"InternetStreamPort\":24545," +
            "\"IsEncrypt\":true,\"P2PCheckInterval\":0,\"P2PKeyVer\":101," +
            "\"P2PLinkKey\":\"" + P2PLinkKey + "\",\"P2PSwitch\":1,\"P2PVer\":3," +
            "\"PermanentKey\":\"HELGDM\",\"PermanentKeyMd5\":\"94671257757cac13654a2a7d308a1453\"," +
            "\"RcType\":0,\"RecordType\":255,\"Serial\":\"FB2200254\",\"StrChannelNo\":\"\"," +
            "\"StreamAuthType\":0,\"StreamType\":" + streamType + ",\"SuperSerial\":\"\",\"SupportECDH\":\"\"," +
            "\"SupportSeek2Playback\":0,\"Token\":\"\",\"TransProto\":\"TCP\",\"UserName\":\"somebody\"," +
            "\"V3Playback\":true,\"VTDUProtoType\":1,\"VtduTimeLimit\":0,\"devNATType\":3," +
            "\"streamBizUrl\":\"biz=5\",\"videoScale\":\"\"}";
    }

    public static void StartServer(string clientDir, string userId, string dataStr, int saltIndex, string linkKey, string devIp, int port) {
        UserId = userId;
        P2PLinkKey = linkKey;
        DevPublicIp = devIp;

        NS_InitLib(clientDir);
        NS_InitPPVSLib();
        _msgDel = new MsgHandler(OnMsg);
        NS_SetMessageHandler(_msgDel, IntPtr.Zero);

        string stunXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<ServerInfo>\n\t<Server type=\"STUN\" ip=\"43.130.155.63\" port=\"6002\" />\n\t<Server type=\"STUN\" ip=\"43.130.155.63\" port=\"6003\" />\n</ServerInfo>";
        NS_SetSpecialInfo(stunXml, 99);

        string p2pCfg = "{\"secret\":{\"data\":\"" + dataStr + "\",\"version\":0,\"saltIndex\":" + saltIndex + "}}";
        NS_SetP2PV3ConfigInfo(p2pCfg);

        int idxPre = NS_AllocSession();
        string preDev = "{\"Channel\":3,\"MaxChannel\":12,\"P2PKeyVer\":101,\"P2PLinkKey\":\"" + linkKey + "\",\"P2PSwitch\":1,\"P2PVer\":3,\"Serial\":\"FB2200254\",\"StreamType\":2,\"SupportNat34\":0,\"devNATType\":3}";
        string preSrv = "{\"casIP\":\"23.23.215.158\",\"casPort\":6500,\"stunIP\":\"43.130.155.63\",\"stunPort\":6002,\"userid\":\"" + userId + "\",\"vtmIP\":\"vtmusmia.ezvizlife.com\",\"vtmPort\":8554}";
        string p2pSrv = "{\"ServerInfo\":[{\"ip\":\"148.153.246.88\",\"port\":6404},{\"ip\":\"148.153.75.244\",\"port\":6404}]}";
        int rPre = NS_StartPreConnection(idxPre, userId, preDev, preSrv, p2pSrv);
        Console.WriteLine("[HikP2PServer] PreConnection result: " + rPre);

        SrvInfoJson = "{\"PublicKey\":\"\",\"PublicKeyVer\":0,\"casIP\":\"23.23.215.158\",\"casPort\":6500,\"tokenUrl\":\"https://usauth.ezvizlife.com\",\"userid\":\"" + userId + "\",\"vtmBackups\":[{\"addr\":\"vtmvirginia.ezvizlife.com\",\"port\":8554},{\"addr\":\"vtmdallas.ezvizlife.com\",\"port\":8554}],\"vtmIP\":\"vtmusmia.ezvizlife.com\",\"vtmPort\":8554}";

        for (int ch = 1; ch <= 4; ch++) {
            _sessions[ch] = NS_AllocSession();
            NS_SetSessionId(_sessions[ch], Guid.NewGuid().ToString("B").ToUpper());
            Form f = new Form();
            f.Width = 640;
            f.Height = 360;
            _forms[ch] = f;
            _hwnds[ch] = f.Handle;
            _lastFrameTime[ch] = DateTime.UtcNow;
            _lastReconnectTime[ch] = DateTime.UtcNow;
            int rPlay = NS_Play_V17(_sessions[ch], _hwnds[ch], UserId, 0, BuildDevInfo(ch), SrvInfoJson, "", "", 0);
            Console.WriteLine("[HikP2PServer] Started Channel " + ch + " (session=" + _sessions[ch] + ", ret=" + rPlay + ")");
        }

        // Start capture loop thread
        Thread capThread = new Thread(CaptureLoop);
        capThread.IsBackground = true;
        capThread.Start();

        // Start HTTP server on 127.0.0.1:port
        TcpListener listener = new TcpListener(IPAddress.Any, port);
        listener.Start();
        Console.WriteLine("[HikP2PServer] Listening on http://localhost:" + port + "/ (Endpoints: /frame/1..4, /mjpeg/1..4, /status)");

        while (true) {
            try {
                TcpClient client = listener.AcceptTcpClient();
                ThreadPool.QueueUserWorkItem(HandleClient, client);
            } catch (Exception ex) {
                Console.WriteLine("[HikP2PServer] Accept error: " + ex.Message);
            }
        }
    }

    private static void CaptureLoop() {
        while (true) {
            for (int ch = 1; ch <= 4; ch++) {
                try {
                    IntPtr pBuf = IntPtr.Zero;
                    int size = 0;
                    int r = NS_JPEGCaptureEx(_sessions[ch], out pBuf, out size);
                    if (r == 0 && size > 0 && pBuf != IntPtr.Zero) {
                        byte[] buf = new byte[size];
                        Marshal.Copy(pBuf, buf, 0, size);
                        NS_JPEGCaptureExFree(pBuf);
                        lock (_lock) {
                            _frames[ch] = buf;
                            _frameCounts[ch]++;
                            _lastFrameTime[ch] = DateTime.UtcNow;
                        }
                    } else {
                        // Check if stale > 20s and reconnect
                        double ageSec = (DateTime.UtcNow - _lastFrameTime[ch]).TotalSeconds;
                        double sinceRecon = (DateTime.UtcNow - _lastReconnectTime[ch]).TotalSeconds;
                        if (ageSec > 20 && sinceRecon > 20) {
                            _lastReconnectTime[ch] = DateTime.UtcNow;
                            NS_Stop_V17(_sessions[ch]);
                            Thread.Sleep(200);
                            NS_Play_V17(_sessions[ch], _hwnds[ch], UserId, 0, BuildDevInfo(ch), SrvInfoJson, "", "", 0);
                            Console.WriteLine("[HikP2PServer] Reconnected Channel " + ch);
                        }
                    }
                } catch {}
            }
            Thread.Sleep(110); // ~9 FPS per channel
        }
    }

    private static void HandleClient(object state) {
        using (TcpClient client = (TcpClient)state) {
            try {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 10000;
                NetworkStream stream = client.GetStream();
                StreamReader reader = new StreamReader(stream, Encoding.ASCII);
                string reqLine = reader.ReadLine();
                if (string.IsNullOrEmpty(reqLine)) return;

                string[] parts = reqLine.Split(' ');
                string method = parts.Length > 0 ? parts[0] : "GET";
                string rawPath = parts.Length > 1 ? parts[1] : "/";
                int qIdx = rawPath.IndexOf('?');
                string path = qIdx >= 0 ? rawPath.Substring(0, qIdx) : rawPath;

                // Consume headers
                string line;
                while (!string.IsNullOrEmpty(line = reader.ReadLine())) {}

                if (method == "OPTIONS") {
                    string optHdr = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n";
                    byte[] bOpt = Encoding.ASCII.GetBytes(optHdr);
                    stream.Write(bOpt, 0, bOpt.Length);
                    return;
                }

                if (path.StartsWith("/frame/") || path.StartsWith("/snapshot/")) {
                    string chStr = path.Substring(path.LastIndexOf('/') + 1);
                    int ch = 1;
                    int.TryParse(chStr, out ch);
                    if (ch < 1 || ch > 4) ch = 1;

                    byte[] jpg = null;
                    lock (_lock) { jpg = _frames[ch]; }

                    if (jpg == null || jpg.Length == 0) {
                        string hdr404 = "HTTP/1.1 503 Service Unavailable\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
                        byte[] b404 = Encoding.ASCII.GetBytes(hdr404);
                        stream.Write(b404, 0, b404.Length);
                        return;
                    }

                    string hdr = "HTTP/1.1 200 OK\r\n" +
                                 "Content-Type: image/jpeg\r\n" +
                                 "Content-Length: " + jpg.Length + "\r\n" +
                                 "Access-Control-Allow-Origin: *\r\n" +
                                 "Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n" +
                                 "Connection: close\r\n\r\n";
                    byte[] bHdr = Encoding.ASCII.GetBytes(hdr);
                    stream.Write(bHdr, 0, bHdr.Length);
                    stream.Write(jpg, 0, jpg.Length);
                    return;
                }

                if (path.StartsWith("/mjpeg/") || path.StartsWith("/stream/")) {
                    string chStr = path.Substring(path.LastIndexOf('/') + 1);
                    int ch = 1;
                    int.TryParse(chStr, out ch);
                    if (ch < 1 || ch > 4) ch = 1;

                    string hdr = "HTTP/1.1 200 OK\r\n" +
                                 "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n" +
                                 "Access-Control-Allow-Origin: *\r\n" +
                                 "Cache-Control: no-store, no-cache, must-revalidate, max-age=0\r\n" +
                                 "Connection: close\r\n\r\n";
                    byte[] bHdr = Encoding.ASCII.GetBytes(hdr);
                    stream.Write(bHdr, 0, bHdr.Length);

                    long lastSentFrame = -1;
                    while (client.Connected) {
                        byte[] jpg = null;
                        long curFrame = 0;
                        lock (_lock) {
                            jpg = _frames[ch];
                            curFrame = _frameCounts[ch];
                        }
                        if (jpg != null && jpg.Length > 0 && curFrame != lastSentFrame) {
                            lastSentFrame = curFrame;
                            string partHdr = "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + jpg.Length + "\r\n\r\n";
                            byte[] bPart = Encoding.ASCII.GetBytes(partHdr);
                            stream.Write(bPart, 0, bPart.Length);
                            stream.Write(jpg, 0, jpg.Length);
                            stream.Write(new byte[] { 13, 10 }, 0, 2);
                            stream.Flush();
                        }
                        Thread.Sleep(90);
                    }
                    return;
                }

                if (path == "/bundle") {
                    StringBuilder bsb = new StringBuilder();
                    bsb.Append("{\"online\":true,\"serial\":\"FB2200254\",\"updatedAt\":\"" + DateTime.UtcNow.ToString("o") + "\",\"frames\":{");
                    for (int ch = 1; ch <= 4; ch++) {
                        byte[] jpg = null;
                        lock (_lock) { jpg = _frames[ch]; }
                        if (ch > 1) bsb.Append(",");
                        if (jpg != null && jpg.Length > 0) {
                            bsb.Append("\"" + ch + "\":\"data:image/jpeg;base64," + Convert.ToBase64String(jpg) + "\"");
                        } else {
                            bsb.Append("\"" + ch + "\":\"\"");
                        }
                    }
                    bsb.Append("}}");
                    byte[] bBody = Encoding.UTF8.GetBytes(bsb.ToString());
                    string bHdr = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + bBody.Length + "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
                    byte[] bHdrBytes = Encoding.ASCII.GetBytes(bHdr);
                    stream.Write(bHdrBytes, 0, bHdrBytes.Length);
                    stream.Write(bBody, 0, bBody.Length);
                    return;
                }

                if ((path == "/" || path == "/index.html" || path == "/app" || path == "/consola") && WebAppHtmlBytes != null && WebAppHtmlBytes.Length > 0) {
                    string htmlHdr = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + WebAppHtmlBytes.Length + "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
                    byte[] bHtmlHdr = Encoding.ASCII.GetBytes(htmlHdr);
                    stream.Write(bHtmlHdr, 0, bHtmlHdr.Length);
                    stream.Write(WebAppHtmlBytes, 0, WebAppHtmlBytes.Length);
                    return;
                }

                // Default: /status JSON
                StringBuilder sb = new StringBuilder();
                sb.Append("{\"online\":true,\"serial\":\"FB2200254\",\"model\":\"iDS-7204HUHI-M1/S\",\"encryption\":\"HELGDM\",\"transport\":\"Hikvision P2P V3 Native (NetStream.dll)\",\"channels\":{");
                for (int ch = 1; ch <= 4; ch++) {
                    byte[] jpg = null;
                    long cnt = 0;
                    double ageMs = 999999;
                    lock (_lock) {
                        jpg = _frames[ch];
                        cnt = _frameCounts[ch];
                        ageMs = Math.Round((DateTime.UtcNow - _lastFrameTime[ch]).TotalMilliseconds);
                    }
                    if (ch > 1) sb.Append(",");
                    sb.Append("\"" + ch + "\":{");
                    sb.Append("\"connected\":" + (jpg != null && jpg.Length > 0 ? "true" : "false") + ",");
                    sb.Append("\"frameBytes\":" + (jpg != null ? jpg.Length : 0) + ",");
                    sb.Append("\"totalFrames\":" + cnt + ",");
                    sb.Append("\"lastFrameAgeMs\":" + ageMs);
                    sb.Append("}");
                }
                sb.Append("}}");
                byte[] body = Encoding.UTF8.GetBytes(sb.ToString());
                string statusHdr = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.Length + "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
                byte[] bStatusHdr = Encoding.ASCII.GetBytes(statusHdr);
                stream.Write(bStatusHdr, 0, bStatusHdr.Length);
                stream.Write(body, 0, body.Length);
            } catch {}
        }
    }
}
"@

$listenPort = if ($env:HIK_PORT) { [int]$env:HIK_PORT } else { 8890 }
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
$consolaHtmlPath = Join-Path $scriptRoot "consola.html"
if (Test-Path $consolaHtmlPath) {
    [HikNativeP2PServer]::WebAppHtmlBytes = [System.IO.File]::ReadAllBytes($consolaHtmlPath)
    Write-Output "[HikP2PServer] Loaded Web Console HTML ($(([HikNativeP2PServer]::WebAppHtmlBytes).Length) bytes) on GET /"
}
[HikNativeP2PServer]::StartServer($clientDir, $p2pUserId, $p2pDataStr, $p2pSaltIndex, $p2pLinkKey, $devPublicIp, $listenPort)
