const prisma = require("../config/prisma");
const { fal } = require("@fal-ai/client");

const FAL_KEY = process.env.FAL_KEY;
// MODELOS (económicos + normal + premium)
const FAL_VIDEO_MODEL_PREMIUM = "fal-ai/kling-video/v2.6/pro/text-to-video";
const FAL_VIDEO_MODEL_MEDIUM = "fal-ai/kandinsky5-pro/text-to-video";
const FAL_VIDEO_MODEL_CHEAP = "fal-ai/kandinsky5/text-to-video/distill";
const FAL_VIDEO_MODEL_HAILUO = "fal-ai/minimax/hailuo-2.3/pro/text-to-video";

const FAL_POLL_INTERVAL_MS = Number(process.env.FAL_POLL_INTERVAL_MS || "15000");
const FAL_POLL_MAX_MS = Number(process.env.FAL_POLL_MAX_MS || "1960000"); // 3 minutos
const FAL_POLL_MAX_ERRORS = Number(process.env.FAL_POLL_MAX_ERRORS || "5");

// Costos fijos en tokens según duración del video
const TOKEN_COSTS = {
  5: 35, // 5 segundos = 35 tokens
  10: 70, // 10 segundos = 70 tokens
};

if (!FAL_KEY) {
  console.warn("⚠️ FAL_KEY no está definido. Fal.ai no funcionará sin la clave.");
}

fal.config({
  credentials: FAL_KEY,
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const extractVideoUrlFromFalResult = (result) => {
  if (!result) return null;

  // intentos rápidos
  const directUrl =
    result?.data?.video?.url ||
    result?.data?.video_url ||
    result?.video?.url ||
    result?.video_url;

  if (typeof directUrl === "string" && directUrl.startsWith("http")) {
    return directUrl;
  }

  const extractUrl = (value) => {
    if (!value) return null;

    if (typeof value === "string" && value.startsWith("http")) {
      if (!value.includes("queue.fal.run")) return value;
      return null;
    }

    if (typeof value === "object") {
      if (
        typeof value.url === "string" &&
        value.url.startsWith("http") &&
        !value.url.includes("queue.fal.run")
      ) {
        return value.url;
      }

      if (
        value.file &&
        typeof value.file === "object" &&
        typeof value.file.url === "string" &&
        value.file.url.startsWith("http")
      ) {
        return value.file.url;
      }

      if (value.output && typeof value.output === "object") return extractUrl(value.output);
      if (value.video && typeof value.video === "object") return extractUrl(value.video);
      if (
        value.outputs &&
        (Array.isArray(value.outputs) || typeof value.outputs === "object")
      ) {
        return extractUrl(value.outputs);
      }
      if (value.result && typeof value.result === "object") return extractUrl(value.result);

      if (Array.isArray(value)) {
        for (const item of value) {
          const url = extractUrl(item);
          if (url) return url;
        }
      }

      return null;
    }

    return null;
  };

  const urlFromResult = extractUrl(result);
  if (urlFromResult) return urlFromResult;

  if (result.output) {
    const url = extractUrl(result.output);
    if (url) return url;
  }
  if (result.outputs) {
    const url = extractUrl(result.outputs);
    if (url) return url;
  }

  return null;
};

const refundVideoTokens = async (videoId, usuarioId, tokensToRefund) => {
  await prisma.$transaction([
    prisma.video.update({
      where: { id: videoId },
      data: { estado: "ERROR" },
    }),
    prisma.user.update({
      where: { id: usuarioId },
      data: { tokens: { increment: tokensToRefund } },
    }),
  ]);
};

const updateVideoStatus = async (videoId, data) => {
  await prisma.video.update({
    where: { id: videoId },
    data,
  });
};

// IMPORTANTÍSIMO: recibe el endpoint completo
async function pollFalRequest(videoId, requestId, modelEndpoint) {
  if (!requestId) {
    console.error(`❌ request_id inválido para video ${videoId}:`, requestId);
    await updateVideoStatus(videoId, { estado: "ERROR" });
    return;
  }

  const endpointId = modelEndpoint;

  const startTime = Date.now();
  let consecutiveErrors = 0;
  let notFoundRetries = 0;
  const MAX_NOT_FOUND_RETRIES = 3;

  while (Date.now() - startTime < FAL_POLL_MAX_MS) {
    try {
      console.log(`⏳ Consultando estado para video ${videoId} con requestId=${requestId}`);
      const status = await fal.queue.status(endpointId, { requestId });

      console.log(`📊 Status respuesta para video ${videoId}:`, JSON.stringify(status, null, 2));

      if (!status || !status.status) {
        await delay(FAL_POLL_INTERVAL_MS);
        continue;
      }

      if (status.status === "COMPLETED") {
        let urlVideo = null;

        try {
          const result = await fal.queue.result(endpointId, { requestId });
          urlVideo = extractVideoUrlFromFalResult(result);
        } catch (resultError) {
          console.warn(`⚠️ Error al obtener resultado mediante SDK: ${resultError.message}`);
        }

        if (!urlVideo && status.response_url) {
          try {
            const responseData = await fetch(status.response_url, {
              headers: { Authorization: `Key ${FAL_KEY}` },
            }).then((r) => r.json());
            urlVideo = extractVideoUrlFromFalResult(responseData);
          } catch (fetchError) {
            console.warn(`⚠️ Error al fetch response_url: ${fetchError.message}`);
          }
        }

        await updateVideoStatus(videoId, {
          estado: "COMPLETADO",
          urlVideo: urlVideo || null,
        });

        return;
      }

      if (status.status === "FAILED" || status.status === "CANCELLED") {
        await updateVideoStatus(videoId, { estado: "ERROR" });
        return;
      }

      consecutiveErrors = 0;
      notFoundRetries = 0;
    } catch (pollError) {
      const message = pollError?.message || String(pollError);
      const isNotFound = message.includes("Not Found") || message.includes("404");
      const isBadRequest = message.includes("Bad Request") || message.includes("400");

      if (isBadRequest) {
        await updateVideoStatus(videoId, { estado: "ERROR" });
        return;
      }

      if (isNotFound) {
        notFoundRetries += 1;
        if (notFoundRetries >= MAX_NOT_FOUND_RETRIES) {
          await updateVideoStatus(videoId, { estado: "ERROR" });
          return;
        }
      } else {
        consecutiveErrors += 1;
        if (consecutiveErrors >= FAL_POLL_MAX_ERRORS) {
          await updateVideoStatus(videoId, { estado: "ERROR" });
          return;
        }
      }
    }

    await delay(FAL_POLL_INTERVAL_MS);
  }

  await updateVideoStatus(videoId, { estado: "ERROR" });
}

const activeFalPolling = new Set();

const startFalPendingPoller = async () => {
  if (!FAL_KEY) return;

  const cleanupStaleVideos = async () => {
    try {
      await prisma.video.updateMany({
        where: { estado: "PENDIENTE" },
        data: { estado: "ERROR" },
      });
    } catch (error) {
      console.error("❌ Error limpiando videos pendientes:", error);
    }
  };

  const pollPendingVideos = async () => {
    await cleanupStaleVideos();

    try {
      const pendingVideos = await prisma.video.findMany({
        where: {
          falRequestId: { not: null },
          estado: { in: ["PENDIENTE", "EN_COLA"] },
        },
        select: {
          id: true,
          falRequestId: true,
          duracion: true,
        },
      });

      for (const video of pendingVideos) {
        const requestId = video.falRequestId;
        if (!requestId || String(requestId).trim().length === 0) continue;
        if (activeFalPolling.has(video.id)) continue;

        activeFalPolling.add(video.id);

        // Regla: usar el modelo guardado en la data (si existe). Si no, fallback por duración.
        const modelTypeForPoll = video.model_type || (video.duracion === 5 ? "cheap" : "premium");
        const modelEndpoint = modelTypeForPoll === "cheap" ? FAL_VIDEO_MODEL_CHEAP : FAL_VIDEO_MODEL_PREMIUM;

        pollFalRequest(video.id, requestId, modelEndpoint)
          .catch((error) => {
            console.error(`❌ Polling fal.ai para video ${video.id} terminó con error:`, error);
          })
          .finally(() => {
            activeFalPolling.delete(video.id);
          });
      }
    } catch (error) {
      console.error("❌ Error en el poller de videos pendientes:", error);
    }
  };

  setInterval(pollPendingVideos, FAL_POLL_INTERVAL_MS);
  pollPendingVideos();
};

const crearVideo = async (req, res) => {
  try {
    const { prompt, duracion, aspect_ratio, model_type } = req.body;

    const ALLOWED_ASPECT_RATIOS = new Set(["16:9", "9:16", "1:1"]);
    const aspectRatioSafe = ALLOWED_ASPECT_RATIOS.has(aspect_ratio) ? aspect_ratio : "16:9";

    // Fal Kandinsky (cheap) espera enums distintos a los strings de UI.
    // UI: 16:9 / 9:16 / 1:1  -> Fal: 3:2 / 2:3 / 1:1
    const aspectRatioFalCheap =
      aspectRatioSafe === "16:9" ? "3:2" : aspectRatioSafe === "9:16" ? "2:3" : "1:1";

    // req.user.id viene de Supabase (UUID string). En tu DB Prisma, User.id es Int.
    // 1) Buscar el usuario interno usando el email desde el token.
    const supabaseUserEmail = req.user.email;
    if (!supabaseUserEmail) {
      return res.status(401).json({ error: "❌ email de usuario no disponible en el token" });
    }

    const usuario = await prisma.user.findUnique({ where: { email: supabaseUserEmail } });
    if (!usuario) {
      return res.status(404).json({ error: "❌ Usuario no encontrado" });
    }

    const usuarioId = usuario.id;

    // Bloqueo de concurrencia: 1 generación activa por usuario
    // Se considera activa si existe un video en cola/procesando.
    const videoActivo = await prisma.video.findFirst({
      where: {
        userId: usuarioId,
        estado: {
          in: ["PENDIENTE", "EN_COLA", "PROCESANDO", "EN_PROGRESO"],
        },
      },
      select: { id: true },
    });

    if (videoActivo) {
      return res.status(400).json({ error: "Ya tienes una generación en curso" });
    }

    if (!prompt) return res.status(400).json({ error: "❌ Faltan campos requeridos" });
    if (String(prompt).trim().length === 0) {
      return res.status(400).json({ error: "❌ El prompt no puede estar vacío" });
    }

    // Costos dinámicos por modelo (Low/Medium/Full/Premium)
    // IMPORTANT: model_type viene del frontend como string. Debe matchear EXACTO.
    const ALLOWED_MODEL_TYPES = new Set([
      "cheap",
      "normal",
      "full",
      "premium",
    ]);

    const modelTypeRaw = typeof model_type === "string" ? model_type.trim() : model_type;

    // Normalización defensiva: el frontend puede mandar variaciones del label.
    const modelTypeNormalized = typeof modelTypeRaw === "string" ? modelTypeRaw.toLowerCase() : modelTypeRaw;

    // Solo Fal (sin Kling)
    const modelTypeSafe = ALLOWED_MODEL_TYPES.has(modelTypeNormalized)
      ? modelTypeNormalized
      : ALLOWED_MODEL_TYPES.has(modelTypeRaw)
        ? modelTypeRaw
        : "cheap";

    console.log("🧪 crearVideo model_type recibido:", modelTypeRaw, " => modelTypeSafe:", modelTypeSafe);

    const TOKEN_COST_BY_MODEL = {
      cheap: 1,
      normal: 6,
      full: 10,
      premium: 16,
    };

    const tokenCost = TOKEN_COST_BY_MODEL[modelTypeSafe];

    // 🔄 REPARADO: Se eliminó la re-declaración redundante de "const usuario" que rompía Node.js
    if (usuario.tokens < tokenCost) return res.status(403).json({ error: "❌ No tienes suficientes tokens." });

    // --- Nuevo flujo Kling (premium_kling) ---
    if (modelTypeSafe === "premium_kling") {
      console.log("🧪 Intercept premium_kling en backend. model_typeRaw=", modelTypeRaw, "model_type=", model_type);

      if (!KLING_API_KEY) {
        return res.status(500).json({ error: "❌ KLING_API_KEY no configurada" });
      }
      if (!image_url) {
        return res.status(400).json({ error: "❌ image_url es requerido para premium_kling" });
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const video = await tx.video.create({
          data: {
            userId: usuarioId,
            temaOriginal: prompt,
            duracion,
            guion: "",
            urlAudio: null,
            urlVideo: null,
            falRequestId: null,
            klingTaskId: null,
            provider: "kling",
            estado: "PENDIENTE",
          },
        });

        await tx.user.update({
          where: { id: usuarioId },
          data: { tokens: usuario.tokens - tokenCost },
        });

        await tx.transaction.create({
          data: {
            userId: usuarioId,
            tipo: "VIDEO_CREACION",
            cantidad: tokenCost,
          },
        });

        return { video };
      });

      // Enviar POST a Kling
      const klingResp = await axios.post(
        "https://api.klingai.com/v1/videos/image-to-video",
        {
          model: "kling-v1-5",
          prompt,
          image: image_url,
          duration: 5,
          mode: "pro",
        },
        {
          headers: {
            Authorization: `Bearer ${KLING_API_KEY}`,
            "Content-Type": "application/json",
          },
          timeout: 120000,
        }
      );

      const data = klingResp?.data;
      const taskId =
        data?.task_id ||
        data?.taskId ||
        data?.data?.task_id ||
        data?.data?.taskId ||
        null;

      if (!taskId) {
        // Reembolsar tokens si Kling no devuelve task_id
        await refundVideoTokens(resultado.video.id, usuarioId, tokenCost);
        return res.status(502).json({ error: "❌ Kling no devolvió task_id", detalles: data });
      }

      await prisma.video.update({
        where: { id: resultado.video.id },
        data: {
          klingTaskId: String(taskId),
          estado: "EN_COLA",
        },
      });

      return res.status(201).json({
        mensaje: "✅ Video (Kling) creado exitosamente",
        video: await prisma.video.findUnique({ where: { id: resultado.video.id } }),
        tokensRestantes: usuario.tokens - tokenCost,
      });
    }

    // --- Flujo anterior (Fal) ---
    const resultado = await prisma.$transaction(async (tx) => {
      const video = await tx.video.create({
        data: {
          userId: usuarioId,
          temaOriginal: prompt,
          duracion,
          guion: "",
          urlAudio: null,
          urlVideo: null,
          falRequestId: null,
          provider: "fal",
          estado: "PENDIENTE",
        },
      });

      const usuarioActualizado = await tx.user.update({
        where: { id: usuarioId },
        data: { tokens: usuario.tokens - tokenCost },
      });

      await tx.transaction.create({
        data: {
          userId: usuarioId,
          tipo: "VIDEO_CREACION",
          cantidad: tokenCost,
        },
      });

      return { video, usuarioActualizado };
    });

    (async () => {
      try {
        console.log(`🎬 [Fal Queue] Solicitando generación para video ${resultado.video.id}...`);

        const isCheap = modelTypeSafe === "cheap";
        const modelEndpoint = modelTypeSafe === "cheap"
          ? FAL_VIDEO_MODEL_CHEAP
          : modelTypeSafe === "normal"
            ? FAL_VIDEO_MODEL_MEDIUM
            : modelTypeSafe === "full"
              ? FAL_VIDEO_MODEL_HAILUO
              : FAL_VIDEO_MODEL_PREMIUM;

        const input = isCheap
          ? (() => {
              const map = {
                "16:9": { width: 1024, height: 576 },
                "9:16": { width: 576, height: 1024 },
                "1:1": { width: 768, height: 768 },
              };
              const dims = map[aspectRatioSafe] || map["16:9"];

              return {
                prompt: prompt,
                aspect_ratio: aspectRatioFalCheap,
                ...dims,
              };
            })()
          : { prompt: prompt, aspect_ratio: aspectRatioSafe };

        const submission = await fal.queue.submit(modelEndpoint, { input });

        let requestId =
          submission?.request_id || submission?.requestId || submission?.id || null;
        if (!requestId && submission?.data?.request_id) requestId = submission.data.request_id;

        if (!requestId || String(requestId).trim().length === 0) {
          throw new Error("Fal.ai no devolvió un request_id válido.");
        }

        await prisma.video.update({
          where: { id: resultado.video.id },
          data: {
            falRequestId: requestId,
            estado: "EN_COLA",
          },
        });

        await pollFalRequest(resultado.video.id, requestId, modelEndpoint);
      } catch (backgroundError) {
        console.error("❌ Error en el procesamiento fal.ai del video:", backgroundError);
        await refundVideoTokens(resultado.video.id, usuarioId, tokenCost);
      }
    })();

    return; // respuesta ya enviada arriba (asíncrona)
  } catch (error) {
    console.error("Error en crearVideo:", error);
    return res.status(500).json({ error: "❌ Error al crear el video", detalles: error.message });
  }
};

const obtenerMisVideos = async (req, res) => {
  try {
    const supabaseUserEmail = req.user.email;
    if (!supabaseUserEmail) {
      return res.status(401).json({ error: "❌ email de usuario no disponible en el token" });
    }

    const usuario = await prisma.user.findUnique({ where: { email: supabaseUserEmail } });
    if (!usuario) {
      return res.status(404).json({ error: "❌ Usuario no encontrado" });
    }

    const videos = await prisma.video.findMany({
      where: { userId: usuario.id },
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ mensaje: "✅ Videos obtenidos", cantidad: videos.length, videos });
  } catch (error) {
    res.status(500).json({ error: "❌ Error al obtener los videos", detalles: error.message });
  }
};

const obtenerVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const supabaseUserEmail = req.user.email;
    if (!supabaseUserEmail) {
      return res.status(401).json({ error: "❌ email de usuario no disponible en el token" });
    }

    const usuario = await prisma.user.findUnique({ where: { email: supabaseUserEmail } });
    if (!usuario) {
      return res.status(404).json({ error: "❌ Usuario no encontrado" });
    }

    const videoIdInt = parseInt(videoId);
    if (Number.isNaN(videoIdInt)) {
      return res.status(400).json({ error: "❌ videoId inválido" });
    }

    const video = await prisma.video.findUnique({ where: { id: videoIdInt } });

    if (!video || video.userId !== usuario.id) {
      return res.status(404).json({ error: "❌ Video no encontrado" });
    }

    res.status(200).json({ mensaje: "✅ Video obtenido", video });
  } catch (error) {
    res.status(500).json({ error: "❌ Error al obtener el video", detalles: error.message });
  }
};

const obtenerEstadoVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const supabaseUserEmail = req.user.email;
    if (!supabaseUserEmail) {
      return res.status(401).json({ error: "❌ email de usuario no disponible en el token" });
    }

    const usuario = await prisma.user.findUnique({ where: { email: supabaseUserEmail } });
    if (!usuario) {
      return res.status(404).json({ error: "❌ Usuario no encontrado" });
    }

    const id = parseInt(videoId);
    if (Number.isNaN(id)) return res.status(400).json({ error: "❌ videoId inválido" });

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== usuario.id) {
      return res.status(404).json({ error: "❌ Video no encontrado" });
    }

    const updated = await prisma.video.findUnique({ where: { id } });
    return res.status(200).json({ mensaje: "✅ Estado (fal)", video: updated });
  } catch (error) {
    return res.status(500).json({ error: "❌ Error en obtenerEstadoVideo", detalles: error.message });
  }
};

const streamVideoProxy = async (req, res) => {
  const https = require("https");
  const http = require("http");
  const { URL } = require("url");

  try {
    const { videoId } = req.params;

    if (!videoId) return res.status(400).send("❌ videoId es requerido");

    const videoData = await prisma.video.findUnique({
      where: { id: parseInt(videoId) },
      select: { id: true, urlVideo: true },
    });

    if (!videoData || !videoData.urlVideo) {
      return res.status(404).send("❌ Video no encontrado");
    }

    const videoUrl = videoData.urlVideo;
    const range = req.headers.range;

    const urlObj = new URL(videoUrl);
    const isHttps = urlObj.protocol === "https:";
    const client = isHttps ? https : http;

    const headers = {};
    if (range) headers.Range = range;

    const upstreamReq = client.request(
      {
        method: "GET",
        protocol: urlObj.protocol,
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: `${urlObj.pathname}${urlObj.search}`,
        headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 200, {
          "Content-Type": upstreamRes.headers["content-type"] || "video/mp4",
          "Accept-Ranges": upstreamRes.headers["accept-ranges"] || "bytes",
          ...(upstreamRes.headers["content-length"]
            ? { "Content-Length": upstreamRes.headers["content-length"] }
            : {}),
          ...(upstreamRes.headers["content-range"]
            ? { "Content-Range": upstreamRes.headers["content-range"] }
            : {}),
          "Content-Disposition": upstreamRes.headers["content-disposition"] || "inline",
          "Cache-Control": upstreamRes.headers["cache-control"] || "no-cache",
        });

        upstreamRes.on("error", (err) => {
          console.error("Error upstream stream:", err);
          try {
            if (!res.headersSent) res.status(500).send("Error al transmitir el video");
          } catch (_) {}
        });

        upstreamRes.pipe(res);

        res.on("close", () => {
          try {
            upstreamRes.destroy();
          } catch (_) {}
        });
      }
    );

    upstreamReq.on("error", (err) => {
      console.error("Error creando request upstream:", err);
      if (!res.headersSent) res.status(500).send("Error al transmitir el video");
    });

    upstreamReq.end();
  } catch (error) {
    console.error("Error en el proxy de video:", error?.message || error);
    if (!res.headersSent) res.status(500).send("Error al transmitir el video");
  }
};

module.exports = {
  crearVideo,
  obtenerMisVideos,
  obtenerVideo,
  obtenerEstadoVideo,
  streamVideoProxy,
  startFalPendingPoller,
};

