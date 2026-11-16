use wasm_bindgen::prelude::*;

fn parse_error_message(kind: &core::num::IntErrorKind) -> &'static str {
    use core::num::IntErrorKind::*;
    match kind {
        Empty => "cannot parse integer from empty string",
        InvalidDigit => "invalid digit found in string",
        PosOverflow => "number too large to fit in target type",
        NegOverflow => "number too small to fit in target type",
        Zero => "number would be zero for non-zero type",
        _ => "failed to parse integer",
    }
}

#[wasm_bindgen]
pub fn from_str_radix(src: &str, radix: u32) -> Result<u32, JsValue> {
    if !(2..=36).contains(&radix) {
        return Err(JsValue::from_str(
            "from_str_radix_int: must lie in the range `[2, 36]`",
        ));
    }
    u32::from_str_radix(src, radix).map_err(|e| JsValue::from_str(parse_error_message(e.kind())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_works() {
        let result = u32::from_str_radix("12", 8).unwrap();
        assert_eq!(result, 10);
        let err = u32::from_str_radix("ff", 8).unwrap_err();
        assert_eq!(
            parse_error_message(err.kind()),
            "invalid digit found in string"
        );
    }
}
