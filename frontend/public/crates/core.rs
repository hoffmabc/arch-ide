#![no_std]

pub mod prelude {
    pub mod v1 {
        pub use core::*;
    }
}

// Core types
pub use core::primitive::*;
pub use core::ops::*;
pub use core::mem::*;
pub use core::ptr::*;
pub use core::cmp::*;
pub use core::clone::*;
pub use core::convert::*;
pub use core::default::*;
pub use core::iter::*;
pub use core::option::*;
pub use core::result::*;