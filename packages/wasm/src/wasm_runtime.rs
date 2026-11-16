use lol_alloc::{AssumeSingleThreaded, FreeListAllocator};

// SAFETY: WebAssembly execution in this module is single-threaded and non-reentrant.
#[global_allocator]
static ALLOC: AssumeSingleThreaded<FreeListAllocator> =
    unsafe { AssumeSingleThreaded::new(FreeListAllocator::new()) };

#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}
