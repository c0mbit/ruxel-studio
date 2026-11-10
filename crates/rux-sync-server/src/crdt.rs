use std::sync::Arc;
use yrs::{Doc, GetString, ReadTxn, StateVector, Text, TextRef, Transact, Update};
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use rux_ast::document::RuxDocument;

#[derive(Debug, Clone)]
pub struct CrdtSession {
    doc: Arc<Doc>,
    text_ref: TextRef,
}

impl Default for CrdtSession {
    fn default() -> Self {
        Self::new()
    }
}

impl CrdtSession {
    pub fn new() -> Self {
        let doc = Arc::new(Doc::new());
        let text_ref = doc.get_or_insert_text("ast_json");
        Self { doc, text_ref }
    }

    pub fn with_client_id(client_id: u64) -> Self {
        let doc = Arc::new(Doc::with_client_id(client_id));
        let text_ref = doc.get_or_insert_text("ast_json");
        Self { doc, text_ref }
    }

    /// Returns the current state vector encoded as V1 binary bytes.
    pub fn state_vector_v1(&self) -> Vec<u8> {
        let txn = self.doc.transact();
        txn.state_vector().encode_v1()
    }

    /// Encodes all updates missing from the given remote state vector.
    pub fn encode_diff_v1(&self, remote_sv_bytes: &[u8]) -> Result<Vec<u8>, String> {
        let sv = if remote_sv_bytes.is_empty() {
            StateVector::default()
        } else {
            StateVector::decode_v1(remote_sv_bytes)
                .map_err(|e| format!("Failed to decode remote state vector: {:?}", e))?
        };
        let txn = self.doc.transact();
        Ok(txn.encode_diff_v1(&sv))
    }

    /// Applies an incremental delta update (V1) to the CRDT document.
    pub fn apply_update_v1(&self, update_bytes: &[u8]) -> Result<(), String> {
        let mut txn = self.doc.transact_mut();
        let update = Update::decode_v1(update_bytes)
            .map_err(|e| format!("Failed to decode update: {:?}", e))?;
        txn.apply_update(update)
            .map_err(|e| format!("Failed to apply update: {:?}", e))?;
        Ok(())
    }

    /// Synchronizes a RuxDocument into the CRDT text buffer "ast_json".
    pub fn set_ast_document(&self, doc: &RuxDocument) -> Result<Vec<u8>, String> {
        let json_str = doc.to_json().map_err(|e| e.to_string())?;
        let mut txn = self.doc.transact_mut();
        let len = self.text_ref.len(&txn);
        if len > 0 {
            self.text_ref.remove_range(&mut txn, 0, len);
        }
        self.text_ref.push(&mut txn, &json_str);
        Ok(txn.encode_update_v1())
    }

    /// Reads the RuxDocument from the CRDT text buffer "ast_json".
    pub fn get_ast_document(&self) -> Result<RuxDocument, String> {
        let txn = self.doc.transact();
        let content = self.text_ref.get_string(&txn);
        RuxDocument::from_json(&content).map_err(|e| format!("CRDT AST JSON is invalid: {}", e))
    }

    /// Returns raw string in "ast_json".
    pub fn get_ast_json_string(&self) -> String {
        let txn = self.doc.transact();
        self.text_ref.get_string(&txn)
    }
}
