package dev.adelie.app.control;

import android.content.Context;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.Charset;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 只监听 127.0.0.1 的本地控制口：内置的 Node 服务（同一个应用 uid）用 HTTP 调它，
 * 再由 {@link PhoneControl} 转成无障碍动作。
 *
 * <p>端口随机、每次启动换一个 token，落盘到 files/adelie/phone-control.json，
 * 别的进程没有 token 就调不动。不对外网暴露，也不接受 0.0.0.0。
 */
public final class ControlServer {
    private static final String TAG = "AdelieControl";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final int MAX_BODY = 1 << 20;

    private static volatile ServerSocket server;
    private static volatile int port;
    private static volatile String token = "";
    private static volatile File portFile;
    private static ExecutorService pool;

    private ControlServer() {
    }

    public static int port() {
        return port;
    }

    public static String token() {
        return token;
    }

    public static boolean running() {
        return server != null && !server.isClosed();
    }

    /** 幂等：已经在跑就什么都不做。 */
    public static synchronized void start(Context context) {
        if (running()) return;
        final Context app = context.getApplicationContext();
        try {
            ServerSocket s = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
            server = s;
            port = s.getLocalPort();
            token = newToken();
            PhoneControl.attachContext(app);
            Projection.attachContext(app);
            pool = Executors.newFixedThreadPool(4);
            writePortFile(app);
            Thread acceptor = new Thread(new Runnable() {
                @Override
                public void run() {
                    acceptLoop(s, app);
                }
            }, "adelie-control");
            acceptor.setDaemon(true);
            acceptor.start();
            Log.i(TAG, "phone control listening on 127.0.0.1:" + port);
        } catch (IOException e) {
            Log.w(TAG, "control server failed: " + e);
            server = null;
            port = 0;
        }
    }

    public static synchronized void stop() {
        ServerSocket s = server;
        server = null;
        port = 0;
        if (s != null) {
            try {
                s.close();
            } catch (IOException ignored) {
            }
        }
        if (pool != null) {
            pool.shutdownNow();
            pool = null;
        }
    }

    /** 端口和 token 写在哪：Node 那边读这个文件才知道怎么调。 */
    public static File portFile() {
        return portFile;
    }

    private static void writePortFile(Context app) {
        republishPortFile(app);
    }

    /**
     * 端口与 token 落到几处：让 Node 那边（ADELIE_HOME=data）和技能脚本都能就近读到。
     * 首启时 data 目录还没解出来，所以 Core 就绪后要再调一次。
     */
    public static void republishPortFile(Context app) {
        if (port == 0) return;
        JSONObject o = new JSONObject();
        try {
            o.put("port", port);
            o.put("token", token);
            o.put("url", "http://127.0.0.1:" + port + "/cmd");
            o.put("help", "POST url，头 X-Adelie-Token: token，体 {\"action\":\"screen\"}");
        } catch (Exception ignored) {
        }
        String text = o.toString();
        File adelie = new File(app.getFilesDir(), "adelie");
        File data = new File(adelie, "data");
        if (data.isDirectory()) {
            portFile = new File(data, "phone-control.json");
            write(portFile, text);
            write(new File(adelie, "phone-control.json"), text);
        } else if (adelie.isDirectory()) {
            portFile = new File(adelie, "phone-control.json");
            write(portFile, text);
        }
        File alt = new File(app.getFilesDir(), "phone-control.json");
        if (portFile == null) portFile = alt;
        write(alt, text);
    }

    private static void write(File f, String text) {
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(f);
            out.write(text.getBytes(UTF8));
        } catch (IOException e) {
            Log.w(TAG, "write " + f + " failed: " + e);
        } finally {
            if (out != null) {
                try {
                    out.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    private static String newToken() {
        byte[] raw = new byte[16];
        new SecureRandom().nextBytes(raw);
        StringBuilder sb = new StringBuilder(32);
        for (byte b : raw) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    private static void acceptLoop(ServerSocket s, Context app) {
        while (!s.isClosed()) {
            final Socket client;
            try {
                client = s.accept();
            } catch (IOException e) {
                return;
            }
            ExecutorService p = pool;
            if (p == null) {
                closeQuietly(client);
                return;
            }
            try {
                p.execute(new Runnable() {
                    @Override
                    public void run() {
                        serve(client);
                    }
                });
            } catch (RuntimeException e) {
                closeQuietly(client);
            }
        }
    }

    private static void serve(Socket client) {
        try {
            client.setSoTimeout(10000);
            InputStream in = new BufferedInputStream(client.getInputStream());
            String head = readHead(in);
            if (head == null) return;
            String[] lines = head.split("\r\n");
            String[] request = lines[0].split(" ");
            if (request.length < 2) {
                reply(client, 400, error("bad_request", "请求行不合法"));
                return;
            }
            String method = request[0].toUpperCase(Locale.ROOT);
            String path = request[1];
            int query = path.indexOf('?');
            String query_ = query >= 0 ? path.substring(query + 1) : "";
            if (query >= 0) path = path.substring(0, query);

            String given = header(lines, "x-adelie-token");
            if (given == null) given = param(query_, "token");
            if (!token.equals(given)) {
                reply(client, 401, error("unauthorized", "缺少或错误的 token"));
                return;
            }

            int length = 0;
            String len = header(lines, "content-length");
            if (len != null) {
                try {
                    length = Integer.parseInt(len.trim());
                } catch (NumberFormatException ignored) {
                }
            }
            if (length > MAX_BODY) {
                reply(client, 413, error("too_large", "请求体太大"));
                return;
            }
            byte[] body = new byte[Math.max(0, length)];
            int read = 0;
            while (read < length) {
                int n = in.read(body, read, length - read);
                if (n < 0) break;
                read += n;
            }

            JSONObject result;
            if ("/cmd".equals(path)) {
                if (!"POST".equals(method)) {
                    reply(client, 405, error("method_not_allowed", "用 POST"));
                    return;
                }
                try {
                    result = PhoneControl.handle(new JSONObject(new String(body, 0, read, UTF8)));
                } catch (Exception e) {
                    result = error("bad_json", "请求体不是 JSON: " + e.getMessage());
                }
            } else if ("/health".equals(path) || "/status".equals(path)) {
                JSONObject req = new JSONObject();
                req.put("action", "status");
                result = PhoneControl.handle(req);
            } else if ("/help".equals(path)) {
                JSONObject req = new JSONObject();
                req.put("action", "help");
                result = PhoneControl.handle(req);
            } else {
                result = error("not_found", "没有这个路径: " + path);
            }
            reply(client, 200, result);
        } catch (Exception e) {
            Log.w(TAG, "serve failed: " + e);
        } finally {
            closeQuietly(client);
        }
    }

    /** 读到请求头结束的空行（\r\n\r\n 或 \n\n）为止；读不到就返回已有的内容。 */
    private static String readHead(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder();
        while (sb.length() < 16384) {
            int c = in.read();
            if (c < 0) return sb.length() == 0 ? null : sb.toString();
            sb.append((char) c);
            int n = sb.length();
            if (n >= 4 && sb.charAt(n - 1) == '\n' && sb.charAt(n - 2) == '\r'
                    && sb.charAt(n - 3) == '\n' && sb.charAt(n - 4) == '\r') {
                return sb.toString();
            }
            if (n >= 2 && sb.charAt(n - 1) == '\n' && sb.charAt(n - 2) == '\n') {
                return sb.toString();
            }
        }
        return sb.toString();
    }

    private static String header(String[] lines, String name) {
        for (int i = 1; i < lines.length; i++) {
            int colon = lines[i].indexOf(':');
            if (colon <= 0) continue;
            if (lines[i].substring(0, colon).trim().equalsIgnoreCase(name)) {
                return lines[i].substring(colon + 1).trim();
            }
        }
        return null;
    }

    private static String param(String query, String name) {
        if (query == null || query.isEmpty()) return null;
        for (String part : query.split("&")) {
            int eq = part.indexOf('=');
            String k = eq >= 0 ? part.substring(0, eq) : part;
            if (k.equals(name)) return eq >= 0 ? part.substring(eq + 1) : "";
        }
        return null;
    }

    private static JSONObject error(String code, String message) {
        JSONObject o = new JSONObject();
        try {
            o.put("ok", false);
            o.put("error", code);
            o.put("message", message == null ? "" : message);
        } catch (Exception ignored) {
        }
        return o;
    }

    private static void reply(Socket client, int status, JSONObject body) {
        try {
            byte[] bytes = body.toString().getBytes(UTF8);
            String head = "HTTP/1.1 " + status + " " + reason(status) + "\r\n"
                    + "Content-Type: application/json; charset=utf-8\r\n"
                    + "Content-Length: " + bytes.length + "\r\n"
                    + "Cache-Control: no-store\r\n"
                    + "Connection: close\r\n\r\n";
            OutputStream out = client.getOutputStream();
            out.write(head.getBytes(UTF8));
            out.write(bytes);
            out.flush();
        } catch (IOException ignored) {
        }
    }

    private static String reason(int status) {
        switch (status) {
            case 200:
                return "OK";
            case 400:
                return "Bad Request";
            case 401:
                return "Unauthorized";
            case 404:
                return "Not Found";
            case 405:
                return "Method Not Allowed";
            case 413:
                return "Payload Too Large";
            default:
                return "Error";
        }
    }

    private static void closeQuietly(Socket s) {
        try {
            s.close();
        } catch (IOException ignored) {
        }
    }
}
