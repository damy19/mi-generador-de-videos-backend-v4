const axios = require("axios");
const { createKlingJwtToken, baseUrl } = require("./klingAxiosClient");

/**
 * Consulta estado de un task (text2video) según doc oficial:
 * GET /v1/videos/text2video/{task_id}
 *
 * @param {string|number} taskId
 * @returns {Promise<{task_status?: string, task_result?: any, raw: any}>}
 */
async function queryText2VideoTask(taskId) {
  if (!taskId) throw new Error("taskId es requerido");

  const token = createKlingJwtToken();
  const url = `${baseUrl()}/v1/videos/text2video/${encodeURIComponent(String(taskId))}`;

  const resp = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 120000,
  });

  const data = resp?.data;
  return {
    task_status: data?.data?.task_status,
    task_result: data?.data?.task_result,
    raw: data,
  };
}

module.exports = { queryText2VideoTask };

