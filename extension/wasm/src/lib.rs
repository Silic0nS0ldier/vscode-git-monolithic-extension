use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn from_str_radix(src: &str, radix: u32) -> Result<u32, String> {
    u32::from_str_radix(src, radix)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = from_str_radix("12", 8).unwrap();
        assert_eq!(result, 10);
    }
}
