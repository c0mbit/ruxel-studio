pub const MESSAGE_SYNC: u64 = 0;
pub const MESSAGE_AWARENESS: u64 = 1;

pub const SYNC_STEP_1: u64 = 0;
pub const SYNC_STEP_2: u64 = 1;
pub const SYNC_UPDATE: u64 = 2;

pub fn read_var_uint(bytes: &[u8]) -> Option<(u64, usize)> {
    let mut res: u64 = 0;
    let mut shift = 0;
    for (i, &b) in bytes.iter().enumerate() {
        if shift >= 64 {
            return None;
        }
        res |= ((b & 0x7F) as u64) << shift;
        if (b & 0x80) == 0 {
            return Some((res, i + 1));
        }
        shift += 7;
    }
    None
}

pub fn write_var_uint(buf: &mut Vec<u8>, mut val: u64) {
    while val > 0x7F {
        buf.push(((val & 0x7F) | 0x80) as u8);
        val >>= 7;
    }
    buf.push((val & 0x7F) as u8);
}

pub fn read_var_uint_bytes(bytes: &[u8]) -> Option<(&[u8], usize)> {
    let (len, consumed) = read_var_uint(bytes)?;
    let len = len as usize;
    if bytes.len() < consumed + len {
        return None;
    }
    Some((&bytes[consumed..consumed + len], consumed + len))
}

pub fn write_var_uint_bytes(buf: &mut Vec<u8>, bytes: &[u8]) {
    write_var_uint(buf, bytes.len() as u64);
    buf.extend_from_slice(bytes);
}

pub fn parse_message_type(bytes: &[u8]) -> Option<(u64, &[u8])> {
    let (msg_type, consumed) = read_var_uint(bytes)?;
    Some((msg_type, &bytes[consumed..]))
}

pub fn parse_sync_message(payload: &[u8]) -> Option<(u64, &[u8])> {
    let (sync_type, consumed) = read_var_uint(payload)?;
    Some((sync_type, &payload[consumed..]))
}

pub fn create_sync_update_message(update: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(update.len() + 8);
    write_var_uint(&mut buf, MESSAGE_SYNC);
    write_var_uint(&mut buf, SYNC_UPDATE);
    write_var_uint_bytes(&mut buf, update);
    buf
}

pub fn create_sync_step1_message(vector: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(vector.len() + 8);
    write_var_uint(&mut buf, MESSAGE_SYNC);
    write_var_uint(&mut buf, SYNC_STEP_1);
    write_var_uint_bytes(&mut buf, vector);
    buf
}

pub fn create_sync_step2_message(update: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(update.len() + 8);
    write_var_uint(&mut buf, MESSAGE_SYNC);
    write_var_uint(&mut buf, SYNC_STEP_2);
    write_var_uint_bytes(&mut buf, update);
    buf
}

pub fn create_awareness_message(update: &[u8]) -> Vec<u8> {
    let mut buf = Vec::with_capacity(update.len() + 8);
    write_var_uint(&mut buf, MESSAGE_AWARENESS);
    write_var_uint_bytes(&mut buf, update);
    buf
}

