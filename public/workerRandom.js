onmessage = function (event) {

    const postProgress = (val) => { postMessage({ type: 'progress', data: val }) };
    const postError = (error) => { postMessage({ type: 'error', data: error }) };

    let idb = indexedDB.open("idb-wwgrid", 1);

    idb.onupgradeneeded = () => {
        let db = idb.result;
        db.createObjectStore("random-data");
        db.createObjectStore("fourier-data");
    };

    idb.onerror = () => { postError(idb.error); };

    idb.onsuccess = () => {
        const columnsCount = event.data.columnsCount;
        const rowsCount = event.data.rowsCount;
        const minRandomValue = event.data.minRandomValue;
        const maxRandomValue = event.data.maxRandomValue;
        const maxRequestsInTransaction = 100;

        let db = idb.result;
        db.transaction("random-data", "readwrite").objectStore("random-data").clear();
        db.transaction("fourier-data", "readwrite").objectStore("fourier-data").clear();

        let currentRow = 0;
        const step = () => {
            let transaction = db.transaction("random-data", "readwrite");
            transaction.onerror = () => { postError(transaction.error); };
            let datas = transaction.objectStore("random-data");
            const progressPercent = rowsCount / 100;

            for (
                let s = 0;
                currentRow < rowsCount && s < maxRequestsInTransaction;
                currentRow += 1, s += 1
            ) {
                if (currentRow % progressPercent === 0) {
                    postProgress(currentRow / progressPercent);
                }
                const row = [];
                // x2 because complexArray in alg is [real0, img0, real1, img1, ... ];
                for (let j = 0; j < columnsCount * 2; j += 1) {
                    row.push(Math.round(minRandomValue - 0.5 + Math.random() * (maxRandomValue - minRandomValue + 1)));
                }
                datas.put(row, currentRow);
            }

            transaction.oncomplete = currentRow < rowsCount ? step : postProgress(100);
        }

        step();
    }
}