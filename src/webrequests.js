const minCores = 4;
const guessCores = (navigator['hardwareConcurrency']||1)<minCores ? minCores : navigator.hardwareConcurrency;

console.log("Initializing workers for "+guessCores+" cores");

const hashingWorkers = [];
const hashingWorkerLoads = [];
for(var iWorker=0;iWorker<guessCores;iWorker++){
    let hashingWorker = new Worker(browser.extension.getURL("src/hashing_worker.js"));
    let iWorkerInstance = iWorker;
    hashingWorker.onmessage = function(e) {
        onWorkerReply(iWorkerInstance,e);
    };
    hashingWorkers.push(hashingWorker);
    hashingWorkerLoads.push(0);
}

function mindex(a) {
 var lowest = 0;
 for (var i = 1; i < a.length; i++) {
  if (a[i] < a[lowest]) lowest = i;
 }
 return lowest;
}
function nextHashingWorkerId(){
    return mindex(hashingWorkerLoads);
}



function onWorkerReply(iWorker, e){
    let action = e.data.action;
    let requestId = e.data.requestId;
    switch(action){
        case "hash_found":
            notifyHashFound({ url: e.data.url });
            break;
        case "completed_finalize_request":
            hashingWorkerLoads[iWorker]--;
            console.log("completed worker "+iWorker+" (load: "+hashingWorkerLoads[iWorker]+")");
            break;
    }
}


class Request {
  static get(requestId, url) {
    if (requestId in Request.all)
      return Request.all[requestId];

    // The request does not exist yet
    let obj = new Request(requestId, url);
    Request.all[requestId] = obj;

    return obj;
  }

  // Hook
  static requestsHook(details) {
    let request = Request.get(details.requestId, details.url);

    let filter = browser.webRequest.filterResponseData(request.id);

    filter.ondata = event => {
      // A new data buffer has arrived !

      // Don't tamper with the data
      filter.write(event.data);

      // Transferts ownership of the data object to the Web Worker - so we must write the data before
      request.sendData(event.data);
    };

    filter.onstop = event => {
      // Cleanup all data associated with the request, and disconnect the filter
      request.cleanup();
      filter.disconnect();
    }

    filter.onerror = event => {
      request.cleanup();
    }
  }
  static hookAll() {
    // Requests
    browser.webRequest.onBeforeRequest.addListener(
      Request.requestsHook,

      // match any URL
      { urls: [ "<all_urls>" ] },
      ["blocking"]
    );
  }

  constructor(requestId, url) {
    this.id = requestId;
    this.url = url;
    this.hashingWorkerId = nextHashingWorkerId();
    this.hashingWorker = hashingWorkers[this.hashingWorkerId];
    this.data_transfered = false;
    hashingWorkerLoads[this.hashingWorkerId]++;
    console.log("Selected worker "+this.hashingWorkerId+" (load: "+hashingWorkerLoads[this.hashingWorkerId]+") for "+url);
  }

  sendData(data) {
    if (!this.data_transfered) {
      this.hashingWorker.postMessage({
        "action": "init_request",

        "requestId": this.id,
        "url": this.url
      });

      this.data_transfered = true;
    }

    // Transfers the object ownership to the Web Worker, instead of making a copy of it
    this.hashingWorker.postMessage({
      "action": "update_request",

      "requestId": this.id,
      "data": data
    }, [data]);
  }

  cleanup() {
    delete Request.all[this.id];

    if (!this.data_transfered)
      return;

    this.hashingWorker.postMessage({
      "action": "finalize_request",

      "requestId": this.id
    });
  }
}

// Static variables of Request
Request.all = {};
