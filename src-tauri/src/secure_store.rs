const SERVICE: &str = "com.gxj.ptracedesk";

fn entry(key: &str) -> Result<keyring::Entry, String> {
  keyring::Entry::new(SERVICE, key).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn secure_get(key: String) -> Result<Option<String>, String> {
  match entry(&key)?.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(error.to_string()),
  }
}

#[tauri::command]
pub fn secure_set(key: String, value: String) -> Result<(), String> {
  entry(&key)?.set_password(&value).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn secure_delete(key: String) -> Result<(), String> {
  match entry(&key)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(error) => Err(error.to_string()),
  }
}
