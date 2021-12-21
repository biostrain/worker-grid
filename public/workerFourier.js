self.importScripts("./fft.js");

onmessage = function (event) {
    const postProgress = (val) => { postMessage({ type: 'progress', data: val }) };
    const postError = (error) => { postMessage({ type: 'error', text: error }) };

    const startRow = event.data.startRow;
    const endRow = event.data.endRow;

    let currentStep = startRow;
    const maxRequestsInTransaction = 1;

    let rawData = [];
    const processingData = [];

    const writeStep = () => {
        let openRequest = indexedDB.open("idb-wwgrid", 1);

        openRequest.onsuccess = function () {
            let db = openRequest.result;
            let writeTransaction = db.transaction("fourier-data", "readwrite");
            let writeStore = writeTransaction.objectStore("fourier-data");

            for (let i = 0; i < processingData.length; i++) {
                let writeRequest = writeStore.put(processingData[i], currentStep + i);
                writeRequest.onerror = () => {
                    postError(writeRequest.error);
                };
                writeRequest.onsuccess = () => {
                    postProgress(currentStep);
                };
            }
            writeTransaction.oncomplete = () => {
                currentStep += maxRequestsInTransaction;
                if (currentStep < endRow) {
                    setTimeout(readStep, 100);
                } else {
                    self.close();
                }
            }
        }
    }

    const processingStep = () => {
        processingData.length = 0;
        for (let i = 0; i < rawData.length; i++) {
            let originalLength = rawData[i].length;
            const zeroFullLength = 2 ** Math.ceil(Math.log2(originalLength));
            const complexArrayLength = 2 ** Math.floor(Math.log2(originalLength));
            for (; originalLength < zeroFullLength; originalLength++) rawData[i].push(0);

            const dataFFT = [];
            FFT.init(complexArrayLength);
            FFT.transform(dataFFT, rawData[i]);
            processingData.push(dataFFT);
        }
        writeStep();
    }

    const readStep = () => {
        rawData.length = 0;
        let openRequest = indexedDB.open("idb-wwgrid", 1);
        openRequest.onsuccess = () => {
            let db = openRequest.result;
            let readTransaction = db.transaction("random-data", "readonly");
            let readStore = readTransaction.objectStore("random-data");
            const endStep = currentStep + maxRequestsInTransaction > endRow ? endRow : currentStep + maxRequestsInTransaction;
            let readRequest = readStore.getAll(IDBKeyRange.bound(currentStep, endStep - 1));
            readTransaction.oncomplete = function () {
                rawData.push(...readRequest.result);
                setTimeout(processingStep, 100);
            }
        }
    }

    // read -> process -> write by maxRequestsInTransaction
    readStep();
};