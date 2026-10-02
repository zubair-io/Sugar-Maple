#include <sys/resource.h>
#include <unistd.h>
#include <stdlib.h>
// This fixed launcher applies a per-process CPU ceiling before exec. Parent
// wall/RSS/output bounds and cancellation must additionally supervise the PID.
int main(int argc, char **argv) {
    if (argc < 3) return 64;
    unsigned long seconds = strtoul(argv[1], NULL, 10);
    if (seconds < 1 || seconds > 120) return 64;
    struct rlimit cpu = {seconds, seconds};
    if (setrlimit(RLIMIT_CPU, &cpu) != 0) return 65;
    execv(argv[2], &argv[2]);
    return 66;
}
