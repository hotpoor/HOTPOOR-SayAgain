#!/usr/bin/env python3
"""Optional old-Mac LAN entrance to a loopback-only SSH reverse tunnel.
No model, keys, HTTP parsing, cloud access, or OS network settings here.
"""
import asyncio,argparse
async def main(host,port,target):
    gate=asyncio.Semaphore(4)
    async def client(reader,writer):
        upstream=None
        try:
            async with gate:
                incoming,upstream=await asyncio.wait_for(asyncio.open_connection('127.0.0.1',target),10)
                async def pump(src,dst):
                    while True:
                        chunk=await asyncio.wait_for(src.read(65536),600)
                        if not chunk:break
                        dst.write(chunk);await dst.drain()
                jobs=[asyncio.create_task(pump(reader,upstream)),asyncio.create_task(pump(incoming,writer))]
                done,pending=await asyncio.wait(jobs,return_when=asyncio.FIRST_COMPLETED)
                for task in pending:task.cancel()
                await asyncio.gather(*jobs,return_exceptions=True)
        except (OSError,asyncio.TimeoutError):pass
        finally:
            writer.close()
            if upstream:upstream.close()
    server=await asyncio.start_server(client,host,port,limit=65536)
    async with server:await server.serve_forever()
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--host',required=True);p.add_argument('--port',type=int,default=8765);p.add_argument('--target',type=int,default=18765);a=p.parse_args()
    asyncio.run(main(a.host,a.port,a.target))
