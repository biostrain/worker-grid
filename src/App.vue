<script>
import "ag-grid-community/dist/styles/ag-grid.css";
import "ag-grid-community/dist/styles/ag-theme-balham.css";
import { AgGridVue } from "ag-grid-vue3";

export default {
  data: function () {
    return {
      num: 20000,
      settings: {
        rowsCount: 10000,
        columnsCount: 10000,
        minRandomValue: -5000,
        maxRandomValue: 5000,
      },
      drawer: false,
      status: {
        type: "",
        text: "App start.",
        progress: 0,
        readyRowsCount: 0,
      },
      gridOptions: null,
      gridApi: null,
      columnApi: null,
      columnDefs: null,
      defaultColDef: null,
      rowData: null,
      dataSet: {
        refreshTimer: null,
        maxBlocksInCache: 0,
        cacheBlockSize: 0,
        blockLoadDebounceMillis: 500,
        getRows: (params) => {
          const idb = indexedDB.open("idb-wwgrid", 1);
          idb.onerror = () => {
            this.error(idb.error);
          };
          idb.onsuccess = () => {
            const db = idb.result;
            const readStore = db
              .transaction("fourier-data", "readonly")
              .objectStore("fourier-data");
            const readRequest = readStore.getAll(
              IDBKeyRange.lowerBound(params.startRow),
              100
            );
            readRequest.onsuccess = () => {
              setTimeout(() => {
                params.successCallback(
                  readRequest.result,
                  this.status.readyRowsCount
                );
              }, 5);
            };
          };
        },
      },
      workers: [],
    };
  },
  beforeMount() {
    this.gridOptions = {
      rowModelType: "infinite",
    };
  },
  mounted() {
    this.gridApi = this.gridOptions.api;
    this.gridColumnApi = this.gridOptions.columnApi;
  },
  methods: {
    run() {
      this.terminate();

      const receivedRandomWorkerMessage = (event) => {
        if (event.data.type === "error") {
          this.error(event.data.text);
          return;
        }

        this.status.progress = event.data.data;
        if (event.data.data === 100) {
          this.status.type = "success";
          this.status.text = "Generation complete. Starting Fourier...";
          this.columnDefs = Array.from(
            { length: this.settings.columnsCount },
            (_, i) => {
              return { headerName: i + 1, field: i.toString() };
            }
          );
          setTimeout(this.generateFourier, 1500);
        }
      };

      this.status.text = `Generation ${(
        this.settings.rowsCount * this.settings.columnsCount
      ).toLocaleString()} elements start.`;
      this.status.type = "";
      this.status.progress = 0;

      const worker = new Worker("./workerRandom.js");
      worker.onmessage = receivedRandomWorkerMessage;
      worker.postMessage(Object.assign({}, this.settings));
      this.workers.push(worker);
    },
    generateFourier() {
      this.status.text = "Generating Fourier.";
      this.status.type = "";
      this.status.progress = 0;

      const receivedFourierWorkerMessage = (event) => {
        if (event.data.type === "error") {
          this.error(event.data.text);
          return;
        }

        this.status.readyRowsCount += 1;
        this.status.progress =
          (100 * this.status.readyRowsCount) / this.settings.rowsCount;
        if (this.status.readyRowsCount === this.settings.rowsCount) {
          this.status.text = "Fourier completed.";
          this.status.type = "success";
          this.workers.length = 0;
          this.gridApi.refreshInfiniteCache();
          clearTimeout(this.dataSet.refreshTimer);
        }
      };

      const logicalProcessors = window.navigator.hardwareConcurrency;
      const rowsPerWorker =
        Math.floor(this.settings.rowsCount / logicalProcessors) || 1;
      let current = 0;
      this.workers = [];
      for (let i = 0; i < logicalProcessors; i += 1) {
        const worker = new Worker("./workerFourier.js");
        worker.onmessage = receivedFourierWorkerMessage;
        const end =
          current + 2 * rowsPerWorker >= this.settings.rowsCount
            ? this.settings.rowsCount
            : current + rowsPerWorker;
        worker.postMessage({
          startRow: current,
          endRow: end,
        });
        this.workers.push(worker);
        current += rowsPerWorker;
      }

      this.gridOptions.api.setDatasource(this.dataSet);
      this.gridApi.refreshCells();
      this.dataSet.refreshTimer = setInterval(() => {
        this.gridApi.refreshInfiniteCache();
      }, 1000);
    },
    error(message) {
      this.terminate();
      this.status.text = message;
    },
    clear() {
      this.terminate();
      const deleteRequest = indexedDB.deleteDatabase("idb-wwgrid");
      deleteRequest.onerror = () => {
        this.error(deleteRequest.error);
      };
      deleteRequest.onblocked = () => {
        this.status.text = "DB blocked, will be cleared after closing.";
      };
      deleteRequest.onsuccess = () => {
        this.status.text = "Cleared.";
      };
    },
    terminate() {
      this.status.readyRowsCount = 0;
      this.gridApi.purgeInfiniteCache();
      if (this.workers.length > 0) {
        this.status.text = "Terminated.";
        this.status.type = "exception";
        this.workers.forEach((worker) => {
          worker.terminate();
        });
        this.workers.length = 0;
      }
      if (this.dataSet.refreshTimer) clearTimeout(this.dataSet.refreshTimer);
    },
  },

  name: "App",
  components: {
    AgGridVue,
  },
};
</script>

<template>
  <el-container direction="vertical" style="height: 100vh; padding: 8px">
    <el-drawer v-model="drawer" title="Settings" direction="ltr" size="400px">
      <el-form label-position="right" label-width="150px" size="mini">
        <el-form-item label="Columns:">
          <el-input-number
            v-model="settings.columnsCount"
            :min="1000"
            :step="500"
            step-strictly
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="Rows:">
          <el-input-number
            v-model="settings.rowsCount"
            :min="1000"
            :step="500"
            step-strictly
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="Min random value:">
          <el-input-number
            v-model="settings.minRandomValue"
            :step="10"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="Max random value:">
          <el-input-number
            v-model="settings.maxRandomValue"
            :step="10"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="drawer = false" size="large"
            >Ok</el-button
          >
        </el-form-item>
      </el-form>
    </el-drawer>
    <el-header>
      <el-button type="primary" @click="drawer = true">Settings</el-button>
      <el-button type="primary" @click="run">Run</el-button>
      <el-button type="primary" @click="terminate">Terminate</el-button>
      <el-button type="primary" @click="clear">Clear DB</el-button>
      <el-divider direction="vertical"></el-divider>
      <span class="status">{{ this.status.text }}</span>

      <el-progress
        :percentage="status.progress"
        :status="status.type"
        :text-inside="true"
        :show-text="false"
      ></el-progress> </el-header
    ><el-main>
      <ag-grid-vue
        style="width: 100%; height: 100%"
        class="ag-theme-material"
        :gridOptions="gridOptions"
        :columnDefs="columnDefs"
        :defaultColDef="{
          width: 75,
        }"
      >
      </ag-grid-vue
    ></el-main>
  </el-container>
</template>

<style>
body {
  margin: 0;
}

.el-button {
  padding: 10px;
  margin: 10px 0px;
}

.el-progress {
  padding-top: 10px;
}

.status {
  white-space: nowrap;
}
</style>
