const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

const URL = "http://localhost:8080/api/data";

let requests = [];
let failureTime = null;
let firstSuccessAfterFail = null;

async function sendRequest() {
  try {
    const res = await fetch(URL);
    const status = res.status;

    if (status !== 200 && !failureTime) {
      failureTime = Date.now();
      console.log("Failure detected at", failureTime);
    }

    if (failureTime && status === 200 && !firstSuccessAfterFail) {
      firstSuccessAfterFail = Date.now();
      console.log("First recovery at", firstSuccessAfterFail);
    }

    requests.push({
      time: Date.now(),
      success: status === 200,
    });

    console.log(`Status: ${status}`);
  } catch (e) {
    if (!failureTime) {
      failureTime = Date.now();
      console.log("Failure detected (exception)");
    }

    requests.push({
      time: Date.now(),
      success: false,
    });

    console.log("ERROR", e.message);
  }
}

// Send requests every 200ms
setInterval(sendRequest, 200);

// Compute metrics after 20s
setTimeout(() => {
  console.log("RESULTS");

  if (failureTime && firstSuccessAfterFail) {
    const tBascule = (firstSuccessAfterFail - failureTime) / 1000;
    console.log(`T_bascule: ${tBascule.toFixed(2)} s`);
  }

  const windowStart = failureTime - 2000;
  const windowEnd = failureTime + 10000;

  const windowRequests = requests.filter((r) => r.time >= windowStart && r.time <= windowEnd);

  const errors = windowRequests.filter((r) => !r.success);

  const errorRate = errors.length / windowRequests.length;

  console.log(`E_bascule: ${(errorRate * 100).toFixed(2)} %`);

  process.exit(0);
}, 20000);
