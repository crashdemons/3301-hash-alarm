importScripts("./hashes/blake2b.js");
importScripts("./hashes/fnv512-wrapped.js");
importScripts("./hashes/sha3-wrapped.js");
importScripts("./hashes/sha512.js");
importScripts("./hashes/streebog-wrapped.js");
importScripts("./hashbox.js");

var currentRequests = {};

function foundHash(url,requestId) {
  postMessage({
    "action": "hash_found",
    "url": url,
    "requestId": requestId
  });
}
function completedAction(action,requestId) {
  postMessage({
    "action": "completed_"+action,
    "requestId": requestId
  });
}

onmessage = function(e) {
  let action = e.data.action;
  let requestId = e.data.requestId;

  switch (action) {
    case "init_request":
      // Hashes the URL
      let url = e.data.url;
      if (HashingBox.hash(url))
        foundHash(url);

      currentRequests[requestId] = {
        "url": url,
        "hashes": new HashingBox()
      }
      break;
    case "update_request":
      currentRequests[requestId].hashes.update(e.data.data);

      break;
    case "finalize_request":
      if (currentRequests[requestId].hashes.verify())
        foundHash(currentRequests[requestId].url, requestId);

      currentRequests[requestId].hashes.cleanup();
      delete currentRequests[requestId];

      break;
  }
  completedAction(action,requestId);
};
