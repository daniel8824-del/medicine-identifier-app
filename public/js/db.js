class MedicineDB {
    constructor() {
        this.dbName = 'medicineDB';
        this.dbVersion = 2;
        this.storeName = 'medicines';
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (db.objectStoreNames.contains(this.storeName)) {
                    db.deleteObjectStore(this.storeName);
                }
                
                const store = db.createObjectStore(this.storeName, { keyPath: 'ITEM_SEQ' });
                
                store.createIndex('ITEM_NAME', 'ITEM_NAME', { multiEntry: false });
                store.createIndex('ENTP_NAME', 'ENTP_NAME', { multiEntry: false });
                store.createIndex('PRINT_FRONT', 'PRINT_FRONT', { multiEntry: false });
                store.createIndex('PRINT_BACK', 'PRINT_BACK', { multiEntry: false });
                store.createIndex('DRUG_SHAPE', 'DRUG_SHAPE', { multiEntry: false });
                store.createIndex('COLOR_CLASS1', 'COLOR_CLASS1', { multiEntry: false });
                store.createIndex('LINE_FRONT', 'LINE_FRONT', { multiEntry: false });
                store.createIndex('FORM_CODE_NAME', 'FORM_CODE_NAME', { multiEntry: false });
            };
        });
    }

    async saveMedicines(medicines) {
        const chunkSize = 100;
        const chunks = [];
        
        for (let i = 0; i < medicines.length; i += chunkSize) {
            chunks.push(medicines.slice(i, i + chunkSize));
        }

        await this.clearAll();

        for (const chunk of chunks) {
            await new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);

                for (const medicine of chunk) {
                    store.put(medicine);
                }
            });
        }
    }

    async clearAll() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async searchMedicines(criteria) {
        const tx = this.db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        let results = await this.getMedicines();

        if (criteria.item_name) {
            const searchTerm = criteria.item_name.toLowerCase();
            results = results.filter(item => 
                item.ITEM_NAME && item.ITEM_NAME.toLowerCase().includes(searchTerm)
            );
        }

        if (criteria.entp_name) {
            const searchTerm = criteria.entp_name.toLowerCase();
            results = results.filter(item => 
                item.ENTP_NAME && item.ENTP_NAME.toLowerCase().includes(searchTerm)
            );
        }

        if (criteria.print_front) {
            const searchTerm = criteria.print_front.toUpperCase();
            results = results.filter(item => {
                if (!item.PRINT_FRONT) return false;
                return item.PRINT_FRONT.trim().toUpperCase().includes(searchTerm);
            });
        }

        if (criteria.print_back) {
            const searchTerm = criteria.print_back.toUpperCase();
            results = results.filter(item => {
                if (!item.PRINT_BACK) return false;
                return item.PRINT_BACK.trim().toUpperCase().includes(searchTerm);
            });
        }

        if (criteria.drug_shape && criteria.drug_shape !== '전체') {
            results = results.filter(item => item.DRUG_SHAPE === criteria.drug_shape);
        }

        if (criteria.color_class1) {
            results = results.filter(item => item.COLOR_CLASS1 === criteria.color_class1);
        }

        if (criteria.line_front) {
            results = results.filter(item => item.LINE_FRONT === criteria.line_front);
        }

        if (criteria.form_code_name) {
            results = results.filter(item => item.FORM_CODE_NAME === criteria.form_code_name);
        }

        return results;
    }

    async getMedicines() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getCount() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.count();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async isInitialized() {
        const count = await this.getCount();
        return count > 0;
    }
}