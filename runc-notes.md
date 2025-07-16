1. create directory for the container, `cd` to location
2. `runc spec --rootless` plus other necessary tweaks
3. copy oci image to 'rootfs' directory
4. `runc run <name-for-container>`

Sample file tree
```
container-dir/
├── config.json
└── rootfs/
    ├── bin/
    ├── etc/
    ├── lib/
    ├── usr/
    └── ... (other filesystem directories)
```